"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X, Send, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderIndicator, type Provider } from "@/components/review/shared";
import { toast } from "@/components/ui/use-toast";
import { RichTextEditor } from "./rich-text-editor";

export interface ComposeMailbox {
  id: string;
  provider: string;
  emailAddress: string;
  syncState: string;
}

export interface ComposePrefill {
  mode: "reply" | "forward";
  itemId: string;
  sourceMailboxId: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  receivedAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function invalidEmails(list: string[]): string[] {
  return list.filter((e) => !EMAIL_RE.test(e));
}

/** A tokenized recipient input: comma/enter separated, chips with remove. */
function RecipientField({
  id,
  label,
  values,
  onChange,
  disabled,
  autoFocus,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const parts = parseRecipients(text);
    if (parts.length) {
      const merged = Array.from(new Set([...values, ...parts]));
      onChange(merged);
    }
    setDraft("");
  }

  return (
    <div className="grid grid-cols-[3rem_1fr] items-start gap-2">
      <Label htmlFor={id} className="pt-2.5 text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring"
      >
        {values.map((v) => {
          const bad = !EMAIL_RE.test(v);
          return (
            <span
              key={v}
              className={
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs " +
                (bad
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-foreground")
              }
            >
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                disabled={disabled}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded hover:bg-black/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          id={id}
          type="text"
          autoFocus={autoFocus}
          disabled={disabled}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={values.length ? "" : "name@example.com"}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          aria-label={label}
        />
      </div>
    </div>
  );
}

function formatQuoteDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ComposeForm({
  mailboxes,
  isDemo,
  prefill,
}: {
  mailboxes: ComposeMailbox[];
  isDemo: boolean;
  prefill?: ComposePrefill;
}) {
  const router = useRouter();
  const hasMailboxes = mailboxes.length > 0;

  const defaultMailboxId = useMemo(() => {
    if (prefill?.sourceMailboxId && mailboxes.some((m) => m.id === prefill.sourceMailboxId)) {
      return prefill.sourceMailboxId;
    }
    return mailboxes[0]?.id ?? "";
  }, [mailboxes, prefill]);

  const [fromId, setFromId] = useState(defaultMailboxId);

  const initialSubject = useMemo(() => {
    if (!prefill) return "";
    const base = prefill.subject ?? "";
    if (prefill.mode === "reply") {
      return /^re:/i.test(base.trim()) ? base : `Re: ${base}`;
    }
    return /^fw:|^fwd:/i.test(base.trim()) ? base : `Fw: ${base}`;
  }, [prefill]);

  const initialTo = useMemo(() => {
    if (prefill?.mode === "reply" && prefill.senderEmail) return [prefill.senderEmail];
    return [];
  }, [prefill]);

  const [to, setTo] = useState<string[]>(initialTo);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bodyText = bodyHtml.replace(/<[^>]*>/g, "").trim();
  const hasContent =
    to.length > 0 || cc.length > 0 || bcc.length > 0 || subject.trim() !== "" || bodyText !== "";
  const canSend =
    !isDemo &&
    hasMailboxes &&
    to.length > 0 &&
    (subject.trim() !== "" || bodyText !== "") &&
    !sending;

  const cancel = useCallback(() => {
    if (hasContent && !window.confirm("Discard this draft? Your changes will be lost.")) {
      return;
    }
    if (prefill) router.push("/review");
    else router.back();
  }, [hasContent, prefill, router]);

  const send = useCallback(async () => {
    if (to.length === 0) {
      toast.error("Add at least one recipient.");
      return;
    }
    const allInvalid = invalidEmails([...to, ...cc, ...bcc]);
    if (allInvalid.length) {
      toast.error(`Invalid email address: ${allInvalid[0]}`);
      return;
    }
    if (subject.trim() === "" && bodyText === "") {
      toast.error("Add a subject or body before sending.");
      return;
    }
    if (!fromId) {
      toast.error("Choose an account to send from.");
      return;
    }

    setSending(true);
    try {
      let url: string;
      let payload: Record<string, unknown>;
      if (prefill?.mode === "reply") {
        url = `/api/review-queue/${prefill.itemId}/reply`;
        payload = { body: bodyHtml, to, ...(cc.length ? { cc } : {}) };
      } else if (prefill?.mode === "forward") {
        url = `/api/review-queue/${prefill.itemId}/forward`;
        payload = { to, ...(cc.length ? { cc } : {}), body: bodyHtml };
      } else {
        url = "/api/compose";
        payload = {
          connectedMailboxId: fromId,
          to,
          ...(cc.length ? { cc } : {}),
          ...(bcc.length ? { bcc } : {}),
          subject,
          body: bodyHtml,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Failed to send email.");
      }

      if (data?.demo) {
        toast("Demo mode: email not actually sent.");
      } else if (data?.syncedToProvider === false) {
        toast.success("Email queued. Sync to provider is pending.");
      } else {
        toast.success("Email sent.");
      }

      if (prefill) {
        router.push("/review");
      } else {
        setTo([]);
        setCc([]);
        setBcc([]);
        setSubject("");
        setBodyHtml("");
        setAttachments([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, bodyText, bodyHtml, fromId, prefill, router]);

  // Global Esc to cancel (Cmd/Ctrl+Enter is handled inside the editor).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        // When focus is outside the editor, still allow send.
        const target = e.target as HTMLElement | null;
        if (target && target.closest(".ProseMirror")) return;
        e.preventDefault();
        if (canSend) send();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, send, canSend]);

  const heading =
    prefill?.mode === "reply"
      ? "Reply"
      : prefill?.mode === "forward"
        ? "Forward"
        : "New message";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-xl">{heading}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancel}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Cancel
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDemo && (
          <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm text-foreground">
            Sending is not available in demo mode. Composing here is a preview
            only.
          </div>
        )}

        {!hasMailboxes && (
          <div className="rounded-md border border-border bg-muted px-3 py-3 text-sm">
            You have no connected mailboxes.{" "}
            <a href="/settings#connected-accounts" className="font-semibold text-primary underline-offset-2 hover:underline">
              Connect a mailbox
            </a>{" "}
            to send email.
          </div>
        )}

        {/* From selector */}
        <div className="grid grid-cols-[3rem_1fr] items-center gap-2">
          <Label htmlFor="from" className="text-xs font-medium text-muted-foreground">
            From
          </Label>
          {hasMailboxes ? (
            <Select value={fromId} onValueChange={setFromId} disabled={isDemo}>
              <SelectTrigger id="from" className="w-full" aria-label="Send from account">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {mailboxes.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <ProviderIndicator provider={m.provider as Provider} />
                      <span>{m.emailAddress}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="from" value="No account" disabled />
          )}
        </div>

        {/* To with CC/BCC toggles */}
        <div className="space-y-2">
          <RecipientField
            id="to"
            label="To"
            values={to}
            onChange={setTo}
            disabled={isDemo || !hasMailboxes}
            autoFocus={prefill?.mode !== "reply"}
          />
          <div className="flex justify-end gap-3 pr-1 text-xs">
            {!showCc && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => setShowCc(true)}
              >
                Add Cc
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => setShowBcc(true)}
              >
                Add Bcc
              </button>
            )}
          </div>
          {showCc && (
            <RecipientField
              id="cc"
              label="Cc"
              values={cc}
              onChange={setCc}
              disabled={isDemo || !hasMailboxes}
            />
          )}
          {showBcc && (
            <RecipientField
              id="bcc"
              label="Bcc"
              values={bcc}
              onChange={setBcc}
              disabled={isDemo || !hasMailboxes}
            />
          )}
        </div>

        {/* Subject */}
        <div className="grid grid-cols-[3rem_1fr] items-center gap-2">
          <Label htmlFor="subject" className="text-xs font-medium text-muted-foreground">
            Subject
          </Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            disabled={isDemo || !hasMailboxes}
          />
        </div>

        {/* Body editor */}
        <RichTextEditor
          onChange={setBodyHtml}
          disabled={isDemo || !hasMailboxes}
          onSubmit={() => canSend && send()}
        />

        {/* Quoted original for reply/forward */}
        {prefill && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
              {prefill.mode === "reply" ? "In reply to" : "Forwarded message"}
            </div>
            <div>
              <span className="font-medium text-foreground">
                {prefill.senderName || prefill.senderEmail}
              </span>{" "}
              &lt;{prefill.senderEmail}&gt;
            </div>
            <div>{formatQuoteDate(prefill.receivedAt)}</div>
            <div>Subject: {prefill.subject || "(no subject)"}</div>
          </div>
        )}

        {/* Attachments */}
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            aria-label="Attach files"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) setAttachments((prev) => [...prev, ...files]);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDemo || !hasMailboxes}
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            <Paperclip className="h-4 w-4" /> Attach files
          </Button>
          {attachments.length > 0 && (
            <ul className="space-y-1">
              {attachments.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-sm"
                >
                  <span className="truncate">
                    {f.name}{" "}
                    <span className="text-muted-foreground">
                      ({Math.max(1, Math.round(f.size / 1024))} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {attachments.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Attachments are passed to your provider on send and are not stored
              by Triage Mail.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="hidden text-xs text-muted-foreground sm:block">
            <kbd className="rounded border border-border bg-muted px-1">⌘/Ctrl</kbd>
            +
            <kbd className="rounded border border-border bg-muted px-1">Enter</kbd>{" "}
            to send · <kbd className="rounded border border-border bg-muted px-1">Esc</kbd>{" "}
            to cancel
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={cancel}>
              Discard
            </Button>
            <Button type="button" onClick={send} disabled={!canSend} className="gap-1.5">
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
