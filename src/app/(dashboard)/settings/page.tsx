"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TagsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  JOB_KEYWORDS_SETTING_KEY,
  keywordsFromSettingValue,
  keywordsToSettingValue,
  normalizeKeywords,
} from "@/lib/job-keywords";

type SettingRow = { id: string; key: string; value: Record<string, unknown> };

export default function SettingsPage() {
  const qc = useQueryClient();
  // ジョブ絞り込みキーワード（1 行 = 1 キーワード）。
  const [keywordsText, setKeywordsText] = useState("");

  const appSettings = useQuery({
    queryKey: ["app-settings-full"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      const rows = json.data.settings as SettingRow[];

      const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));

      return { rows, byKey };
    },
  });

  useEffect(() => {
    const byKey = appSettings.data?.byKey;
    if (!byKey) return;

    const kw = keywordsFromSettingValue(byKey[JOB_KEYWORDS_SETTING_KEY]);
    setKeywordsText(kw.join("\n"));
  }, [appSettings.data]);

  const parsedKeywords = normalizeKeywords(keywordsText);

  const saveKeywords = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            key: JOB_KEYWORDS_SETTING_KEY,
            value: keywordsToSettingValue(parsedKeywords),
          },
        ]),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json;
    },
    onSuccess: () => {
      toast.success(`キーワードを保存しました（${parsedKeywords.length}件）`);
      void qc.invalidateQueries({ queryKey: ["app-settings-full"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="text-sm text-zinc-500">Operational toggles mirrored into `AppSetting` rows.</p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TagsIcon className="size-5 text-emerald-500" /> ジョブ絞り込みキーワード
          </CardTitle>
          <CardDescription>
            1 行に 1 つキーワードを入力します。Jobs 一覧で「キーワード」フィルタを ON にすると、
            いずれかのキーワードがタイトルまたは説明文に含まれる案件のみが表示されます（OR 一致・大文字小文字を区別しません）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {appSettings.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="job-keywords" className="text-xs uppercase tracking-wide">
                  キーワード（1 行に 1 つ・カンマ区切りも可）
                </Label>
                <Textarea
                  id="job-keywords"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder={"Rails\nNext.js\nLP制作\nGCP"}
                  className="h-40 font-mono text-sm leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {parsedKeywords.length === 0 ? (
                  <span className="text-xs text-zinc-500">
                    キーワード未設定 — フィルタを ON にしても全件が表示されます。
                  </span>
                ) : (
                  parsedKeywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => saveKeywords.mutate()} disabled={saveKeywords.isPending}>
                  キーワードを保存
                </Button>
                <span className="text-xs text-zinc-500">{parsedKeywords.length} 件</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
