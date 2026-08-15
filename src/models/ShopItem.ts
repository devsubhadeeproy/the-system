import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type Model,
} from "mongoose";

export interface ShopItem {
  title: string;
  description: string;
  cost: number;
  stock?: number;
}

export type ShopItemDocument = HydratedDocument<ShopItem>;

const shopItemSchema = new Schema<ShopItem>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1_000,
    },
    cost: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: false, min: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

shopItemSchema.index({ cost: 1, title: 1 });

const ShopItemModel =
  (models.ShopItem as Model<ShopItem> | undefined) ??
  model<ShopItem>("ShopItem", shopItemSchema);

export default ShopItemModel;
