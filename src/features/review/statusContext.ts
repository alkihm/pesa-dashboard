import { createContext, useContext } from "react";

import type { ReviewStatus } from "@/lib/review";

export interface ReviewStatusValue {
  status?: ReviewStatus;
  /** Load the status again, e.g. after Mark reviewed or a fix. */
  refresh: () => void;
}

export const ReviewStatusContext = createContext<ReviewStatusValue | null>(null);

/** The app-wide review status ([4.3]); null outside the signed-in shell (and in screen tests). */
export const useReviewStatus = () => useContext(ReviewStatusContext);
