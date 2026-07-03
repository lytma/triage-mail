"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";

type Classification =
  | "important"
  | "fyi"
  | "newsletter"
  | "marketing"
  | "receipt"
  | "automated_notification";

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  important: "Important",
  fyi: "FYI",
  newsletter: "Newsletter",
  marketing: "Marketing",
  receipt: "Receipt",
  automated_notification: "Automated notification",
};

interface Rule {
  id: string;
  plainEnglishText: string;
  summary: string | null;
  targetClassification: Classification;
  targetCategoryFolderId: string | null;
  isActive: boolean;
  priority: number;
}

interface Folder {
  id: string;
  name: string;
  slug: string;
}

export function TriageRulesSection({ isDemo }: { isDemo: boolean }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Rule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  async function load() {
    try {
      const [rr, ff] = await Promise.all([
        fetch("/api/triage-rules").then((r) => r.json()),
        fetch("/api/category-folders").then((r) => r.json()),
      ]);
      setRules(rr.rules ?? []);
      setFolders(ff.folders ?? []);
    } catch {
      setRules([]);
      toast.error("Couldn't load triage rules.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(rule: Rule, next: boolean) {
    setBusyId(rule.id);
    // Optimistic update.
    setRules((prev) =>
      prev ? prev.map((r) => (r.id === rule.id ? { ...r, isActive: next } : r)) : prev
    );
    try {
      const res = await fetch(`/api/triage-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure.
      setRules((prev) =>
        prev ? prev.map((r) => (r.id === rule.id ? { ...r, isActive: !next } : r)) : prev
      );
      toast.error("Couldn't update the rule.");
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rules) return;
    const other = index + dir;
    if (other < 0 || other >= rules.length) return;
    const a = rules[index];
    const b = rules[other];
    setBusyId(a.id);
    try {
      // Swap priority values between the two neighbors.
      await Promise.all([
        fetch(`/api/triage-rules/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: b.priority }),
        }),
        fetch(`/api/triage-rules/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: a.priority }),
        }),
      ]);
      // Reload to reflect the server's canonical priority-desc ordering.
      await load();
    } catch {
      toast.error("Couldn't reorder rules.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rule: Rule) {
    setBusyId(rule.id);
    try {
      const res = await fetch(`/api/triage-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRules((prev) => (prev ? prev.filter((r) => r.id !== rule.id) : prev));
      toast.success("Rule deleted.");
    } catch {
      toast.error("Couldn't delete the rule.");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(rule: Rule) {
    setEditing(rule);
    setFormOpen(true);
  }

  return (
    <Card id="triage-rules" className="scroll-mt-20">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Triage rules</CardTitle>
          <CardDescription>
            Plain-English rules always override the AI. Higher rules run first.
          </CardDescription>
        </div>
        {!isDemo && (
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add rule
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isDemo && (
          <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">
            Editing triage rules is not available in demo mode. You can view the
            seeded rules below.
          </div>
        )}

        {rules === null ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No rules yet. {isDemo ? "" : "Add one to take deterministic control of routing."}
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule, i) => (
              <li
                key={rule.id}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                {!isDemo && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Move rule up"
                      disabled={i === 0 || busyId !== null}
                      onClick={() => move(i, -1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move rule down"
                      disabled={i === rules.length - 1 || busyId !== null}
                      onClick={() => move(i, 1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  {/* Rendered verbatim to reinforce trust. */}
                  <p className="font-medium leading-snug">{rule.plainEnglishText}</p>
                  {rule.summary && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {rule.summary}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      → {CLASSIFICATION_LABELS[rule.targetClassification]}
                    </Badge>
                    {!rule.isActive && <Badge variant="outline">Inactive</Badge>}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`active-${rule.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Active
                    </Label>
                    <Switch
                      id={`active-${rule.id}`}
                      checked={rule.isActive}
                      disabled={isDemo || busyId === rule.id}
                      onCheckedChange={(v) => toggleActive(rule, v)}
                      aria-label={`Toggle rule ${rule.isActive ? "off" : "on"}`}
                    />
                  </div>
                  {!isDemo && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Edit rule"
                        onClick={() => openEdit(rule)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Delete rule"
                        onClick={() => setConfirmDelete(rule)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {formOpen && (
        <RuleFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          folders={folders}
          editing={editing}
          onSaved={load}
        />
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete rule?</DialogTitle>
            <DialogDescription>
              This rule will stop applying to new incoming mail. Already-triaged
              email is unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => confirmDelete && remove(confirmDelete)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RuleFormDialog({
  open,
  onOpenChange,
  folders,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folders: Folder[];
  editing: Rule | null;
  onSaved: () => void | Promise<void>;
}) {
  const [text, setText] = useState(editing?.plainEnglishText ?? "");
  const [classification, setClassification] = useState<Classification>(
    editing?.targetClassification ?? "important"
  );
  const [folderId, setFolderId] = useState<string>(
    editing?.targetCategoryFolderId ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(editing?.summary ?? null);

  const showFolder = classification !== "important";

  async function save() {
    if (text.trim() === "") {
      toast.error("Enter a rule in plain English.");
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`/api/triage-rules/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plainEnglishText: text,
            targetClassification: classification,
          }),
        });
      } else {
        res = await fetch("/api/triage-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plainEnglishText: text,
            targetClassification: classification,
            ...(showFolder && folderId ? { targetCategoryFolderId: folderId } : {}),
          }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save the rule.");
      setPreview(data.summary ?? null);
      toast.success(editing ? "Rule updated." : "Rule created.");
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit rule" : "Add triage rule"}</DialogTitle>
          <DialogDescription>
            Describe the rule in plain English. We&apos;ll parse it and show you
            how it will be applied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-text">Rule</Label>
            <Textarea
              id="rule-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder='e.g. "Anything from my accountant is always important"'
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-class">Route to</Label>
            <Select
              value={classification}
              onValueChange={(v) => setClassification(v as Classification)}
            >
              <SelectTrigger id="rule-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CLASSIFICATION_LABELS) as Classification[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CLASSIFICATION_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showFolder && folders.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="rule-folder">Category folder (optional)</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger id="rule-folder">
                  <SelectValue placeholder="Default folder for this category" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {preview && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">Parsed as:</span> {preview}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
