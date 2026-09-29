"use client";

import { useState, useEffect } from "react";
import { TagsClient } from "./TagsClient";
import type { TagRecord } from "@/lib/types";

export default function TagsPage() {
  const [tags, setTags] = useState<TagRecord[]>([]);
  useEffect(() => {
    fetch("/api/admin/tags").then((r) => r.json()).then(setTags);
  }, []);
  return <TagsClient tags={tags} />;
}
