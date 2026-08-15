import mongoose, { type ConnectOptions, type Mongoose } from "mongoose";

type MongooseCache = {
  connection: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Missing MONGODB_URI environment variable. Add it to your local environment before connecting to MongoDB.",
  );
}

const mongoDbUri = MONGODB_URI;

const cached =
  globalThis.mongooseCache ??
  (globalThis.mongooseCache = {
    connection: null,
    promise: null,
  });

export async function connectMongoDB(): Promise<Mongoose> {
  if (cached.connection) {
    return cached.connection;
  }

  if (!cached.promise) {
    const options: ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    };

    if (process.env.MONGODB_DB) {
      options.dbName = process.env.MONGODB_DB;
    }

    cached.promise = mongoose.connect(mongoDbUri, options);
  }

  try {
    cached.connection = await cached.promise;
    return cached.connection;
  } catch (error) {
    cached.promise = null;

    const detail =
      error instanceof Error ? error.message : "Unknown MongoDB connection error";

    throw new Error(`Failed to connect to MongoDB: ${detail}`);
  }
}

export default connectMongoDB;
