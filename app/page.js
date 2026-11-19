import { Suspense } from "react";
import CoinTabs from "@/components/CoinTabs";

export default function Home() {
  return (
    <Suspense>
      <CoinTabs />
    </Suspense>
  );
}
