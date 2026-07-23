// Landing section — the three steps of /create-launchpad, described exactly as the wizard performs
// them (Identity -> Look -> Sign). If the wizard ever gains or loses a step, this section is the
// thing that starts lying first, so it is kept deliberately thin and literal.

// The "Step 1 — Identity" kickers were dropped: the large ghosted numeral carries the ordinal now,
// and repeating it in an uppercase label was the same fact twice.
const STEPS: { title: string; body: string }[] = [
  {
    title: "Name it",
    // Logo upload is part of wizard step 1 (Identity), not step 2 — keep it on this line so the
    // section keeps matching the screens it describes.
    body: "The name traders see, your logo, your slug.",
  },
  {
    title: "Pick the look",
    body: "A theme and an accent, previewed on the real board.",
  },
  {
    title: "Sign and go live",
    body: "One wallet signature. Your subdomain is live at once.",
  },
];

export function HowItWorks() {
  return (
    <section className="mk-steps" aria-labelledby="mk-steps-h">
      <header className="mk-shead">
        <h2 id="mk-steps-h" className="mk-shead-title">
          Three steps, no code
        </h2>
        {/* No lead paragraph: "Nothing to deploy, nothing to configure" restated the h2 in longer
            words, and .mk-shead degrades to a single column cleanly when the second cell is absent. */}
      </header>

      <ol className="mk-steps-list">
        {STEPS.map((s, i) => (
          <li className="mk-step" key={s.title}>
            <span className="mk-step-n" aria-hidden="true">
              {i + 1}
            </span>
            <h3 className="mk-step-title">{s.title}</h3>
            <p className="mk-step-body">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
