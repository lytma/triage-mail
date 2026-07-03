export default function HomePage() {
  return (
    <main className="mk-wrap" style={{ paddingTop: "4rem", paddingBottom: "4rem" }}>
      <span className="mk-eyebrow">AI email triage</span>
      <h1 className="mk-hero-title">Only review what actually matters.</h1>
      <p style={{ color: "var(--color-muted-fg)", maxWidth: 640 }}>
        Triage Mail unifies your Gmail and Outlook inboxes and uses a hosted LLM
        to classify every incoming email — routing the important ones to a
        Review queue and the rest into category folders. (Scaffold placeholder —
        full landing page lands in a later milestone.)
      </p>
    </main>
  );
}
