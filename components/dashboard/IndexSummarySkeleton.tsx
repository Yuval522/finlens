import { Skeleton } from "@/components/shared/Skeleton";

/** Loading-state placeholder for IndexSummaryCard — mirrors its exact sizing so the skeleton-to-loaded swap doesn't reflow. */
export function IndexSummarySkeleton() {
  return (
    <div className="hig-card px-[18px] py-4">
      <Skeleton className="mb-2 h-3 w-16" />
      <Skeleton className="mb-1.5 h-5 w-24" />
      <Skeleton className="h-[22px] w-14 rounded-full" />
    </div>
  );
}
