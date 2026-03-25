export interface Review {
  id: string;
  storeId: string;
  source: string;
  reviewerName: string | null;
  rating: number;
  comment: string | null;
  reviewDate: string;
  orderId: string | null;
  responded: boolean;
  responseText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewRepository {
  findByStore(storeId: string): Promise<Review[]>;
  upsert(review: Review): Promise<void>;
}
