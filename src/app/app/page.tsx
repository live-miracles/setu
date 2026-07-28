import type { Metadata } from "next";
import { WorkspaceApp } from "@/components/app/workspace-app";

export const metadata: Metadata = {
  title: "Operations",
};

export default function AppPage() {
  return <WorkspaceApp />;
}
