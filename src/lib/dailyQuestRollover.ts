import { Types } from "mongoose";
import connectMongoDB from "@/lib/mongodb";
import QuestModel from "@/models/Quest";
import DailyQuestCompletionModel from "@/models/DailyQuestCompletion";
import PenaltyModel from "@/models/Penalty";
import UserModel, { PLAYER_ATTRIBUTES, type PlayerAttribute, type UserDocument } from "@/models/User";
import { DAILY_QUEST_DEFINITIONS } from "@/lib/dailyQuests";

export const DAILY_CYCLE_RESET_HOUR = 2;
export const DAILY_CYCLE_RESET_MINUTE = 30;
const MISSED_QUEST_ATTRIBUTE_PENALTY = 1;

type RolloverResult = { currentDateKey:string; missedQuestCount:number; penaltiesApplied:number; initializedToday:boolean };

export function getCurrentGameDateKey(timezone:string, now=new Date()):string {
  const shifted = new Date(now.getTime() - (DAILY_CYCLE_RESET_HOUR * 60 + DAILY_CYCLE_RESET_MINUTE) * 60_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone:timezone, year:"numeric", month:"2-digit", day:"2-digit" }).format(shifted);
}

export function dateKeyToUtcDate(dateKey:string):Date {
  const [year,month,day] = dateKey.split("-").map(Number);
  if (![year,month,day].every(Number.isInteger)) throw new Error(`Invalid date key: ${dateKey}`);
  return new Date(Date.UTC(year,month-1,day));
}
function addDays(key:string, amount:number):string { const d=dateKeyToUtcDate(key); d.setUTCDate(d.getUTCDate()+amount); return d.toISOString().slice(0,10); }

function selectPenaltyAttribute(questKey:string):PlayerAttribute|undefined {
  const definition=DAILY_QUEST_DEFINITIONS.find(q=>q.key===questKey);
  return definition?.targetAttributes.find(a=>PLAYER_ATTRIBUTES.includes(a));
}

async function ensureDailyRecord(userId:Types.ObjectId, questKey:string, dateKey:string):Promise<void> {
  const date=dateKeyToUtcDate(dateKey);
  await DailyQuestCompletionModel.updateOne({userId,dailyQuestKey:questKey,date},{ $setOnInsert:{userId,dailyQuestKey:questKey,date,status:"AVAILABLE",penaltyApplied:false} },{upsert:true});
}

async function applyMissedQuestPenalty(user:UserDocument, questKey:string, dateKey:string):Promise<boolean> {
  const attribute=selectPenaltyAttribute(questKey);
  if(!attribute) return false;
  let penalty=await PenaltyModel.findOne({userId:user._id,questKey,dateKey});
  if(penalty?.applied) return false;
  if(!penalty){
    try {
      penalty=await PenaltyModel.create({userId:user._id,questKey,dateKey,type:"ATTRIBUTE_LOSS",amount:MISSED_QUEST_ATTRIBUTE_PENALTY,attribute,reason:`Daily quest "${questKey}" was missed on ${dateKey}.`,applied:false});
    } catch(error) {
      if(error instanceof Error && "code" in error && (error as {code?:number}).code===11000) return false;
      throw error;
    }
  }
  user.attributes[attribute]=Math.max(0,user.attributes[attribute]-MISSED_QUEST_ATTRIBUTE_PENALTY);
  user.markModified("attributes");
  await user.save();
  await PenaltyModel.updateOne({_id:penalty._id,applied:false},{$set:{applied:true,appliedAt:new Date()}});
  return true;
}

async function processUserDailyQuestRollover(user:UserDocument):Promise<RolloverResult> {
  const currentDateKey=getCurrentGameDateKey(user.timezone);
  const dailyQuests=await QuestModel.find({isPermanentDaily:true,type:"DAILY",dailyQuestKey:{$exists:true,$ne:null}}).lean();
  if(!user.lastDailyQuestProcessedDate){
    for(const quest of dailyQuests) if(quest.dailyQuestKey) await ensureDailyRecord(user._id,quest.dailyQuestKey,currentDateKey);
    user.lastDailyQuestProcessedDate=currentDateKey; await user.save();
    return {currentDateKey,missedQuestCount:0,penaltiesApplied:0,initializedToday:true};
  }
  let dateToProcess=addDays(user.lastDailyQuestProcessedDate,1);
  const yesterday=addDays(currentDateKey,-1);
  let missedQuestCount=0,penaltiesApplied=0;
  while(dateToProcess<=yesterday){
    for(const quest of dailyQuests){
      const questKey=quest.dailyQuestKey; if(!questKey) continue;
      await ensureDailyRecord(user._id,questKey,dateToProcess);
      const dailyRecord=await DailyQuestCompletionModel.findOne({userId:user._id,dailyQuestKey:questKey,date:dateKeyToUtcDate(dateToProcess)});
      if(!dailyRecord || dailyRecord.status==="COMPLETED") continue;
      if(dailyRecord.status==="AVAILABLE" || dailyRecord.status==="PENDING") { dailyRecord.status="MISSED"; await dailyRecord.save(); missedQuestCount++; }
      if(!dailyRecord.penaltyApplied){
        const applied=await applyMissedQuestPenalty(user,questKey,dateToProcess);
        if(applied){ dailyRecord.penaltyApplied=true; await dailyRecord.save(); penaltiesApplied++; }
        else {
          const existing=await PenaltyModel.findOne({userId:user._id,questKey,dateKey:dateToProcess}).lean();
          if(existing?.applied){ dailyRecord.penaltyApplied=true; await dailyRecord.save(); }
        }
      }
    }
    dateToProcess=addDays(dateToProcess,1);
  }
  for(const quest of dailyQuests) if(quest.dailyQuestKey) await ensureDailyRecord(user._id,quest.dailyQuestKey,currentDateKey);
  user.lastDailyQuestProcessedDate=currentDateKey; await user.save();
  return {currentDateKey,missedQuestCount,penaltiesApplied,initializedToday:false};
}

export async function processDailyQuestRollover(userId:Types.ObjectId):Promise<RolloverResult>{
  await connectMongoDB(); const user=await UserModel.findById(userId); if(!user) throw new Error("Player not found."); return processUserDailyQuestRollover(user);
}

export async function processAllUsersDailyQuestRollover():Promise<{processedUsers:number;missedQuestCount:number;penaltiesApplied:number}> {
  await connectMongoDB(); const users=await UserModel.find({}).sort({createdAt:1}); let missedQuestCount=0,penaltiesApplied=0;
  for(const user of users){ const result=await processUserDailyQuestRollover(user); missedQuestCount+=result.missedQuestCount; penaltiesApplied+=result.penaltiesApplied; }
  return {processedUsers:users.length,missedQuestCount,penaltiesApplied};
}
