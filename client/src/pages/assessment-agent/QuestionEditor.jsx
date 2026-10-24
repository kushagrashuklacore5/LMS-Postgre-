import { CircleDot, Hash, ListChecks } from "lucide-react";
import { LETTERS, NUMERIC_FORMATS, QUESTION_TYPES, withType } from "./questionForm";
import { QuestionImageField } from "../../components/QuestionImage";

/*
 * AI Assessment Agent - one question's editor for all three types, used by the AI review
 * screen and the manual "Add a question" form. Controlled: `value` is the editable state from
 * questionForm.js; `onChange` receives the next state.
 */

const TYPE_ICON = { single_mcq: CircleDot, multi_select: ListChecks, numerical: Hash };

export function TypePicker({ value, onChange, available, size = "md", testId }) {
  return (
    <div className="inline-flex flex-wrap gap-2" role="radiogroup" aria-label="Question type" data-testid={testId}>
      {QUESTION_TYPES.map((t) => {
        const Icon = TYPE_ICON[t.id];
        const enabled = !available || available.includes(t.id);
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!enabled}
            title={enabled ? t.hint : "Not available yet (a database update is pending)"}
            onClick={() => onChange(t.id)}
            data-type={t.id}
            className={`flex items-center gap-2 rounded-none border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              size === "lg" ? "px-4 py-3" : "px-3 py-1.5 text-xs font-semibold"
            } ${
              active
                ? "border-[#B99652] bg-[#fff8e7] text-[#92400e] ring-1 ring-[#B99652] shadow-xs"
                : "border-[#ebdcaa] bg-white text-[#665e4d] hover:border-[#B99652]/60 hover:bg-[#fffdf4]/50"
            }`}
          >
            <Icon size={size === "lg" ? 18 : 15} className={`shrink-0 ${active ? "text-[#B99652]" : "text-[#7a705a]"}`} />
            <span>
              <span className={`block font-bold leading-tight ${active ? "text-[#92400e]" : "text-[#1e1b4b]"}`}>{t.label}</span>
              {size === "lg" && <span className="block text-xs text-[#7a705a] font-normal mt-0.5">{t.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function QuestionEditor({ value: q, onChange, idPrefix, availableTypes, allowTypeChange = true, explanationPlaceholder = "Explanation (teachers only; students never see it)" }) {
  const set = (patch) => onChange({ ...q, ...patch });
  const setOption = (j, text) => set({ options: q.options.map((o, k) => (k === j ? text : o)) });
  const toggleCorrect = (j) => {
    if (q.type === "single_mcq") return set({ correct: [j] });
    return set({ correct: q.correct.includes(j) ? q.correct.filter((k) => k !== j) : [...q.correct, j].sort() });
  };

  return (
    <div className="space-y-3.5">
      {allowTypeChange && (
        <TypePicker value={q.type} onChange={(type) => onChange(withType(q, type))} available={availableTypes} testId={`${idPrefix}-type`} />
      )}
      <textarea
        className="w-full p-3 border border-[#ebdcaa] rounded-none bg-[#fffdf4]/40 text-[#1e1b4b] text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none transition-all placeholder:text-[#a09783]"
        rows={2}
        placeholder="Question text"
        value={q.text}
        onChange={(e) => set({ text: e.target.value })}
      />
      {/* Optional diagram / figure for this question (all question types) */}
      <QuestionImageField imageKey={q.imageKey} onChange={(imageKey) => set({ imageKey })} />

      {q.type === "numerical" ? (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] items-end p-3.5 rounded-none bg-[#fffdf4] border border-[#ebdcaa]">
          <label className="text-xs font-bold text-[#665e4d]">
            <span className="block mb-1">Answer format</span>
            <select
              className="p-2 border border-[#ebdcaa] rounded-none bg-white text-xs font-semibold text-[#1e1b4b] focus:border-[#B99652] outline-none"
              value={q.numericFormat}
              onChange={(e) => set({ numericFormat: e.target.value })}
              data-testid={`${idPrefix}-format`}
            >
              {NUMERIC_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-[#665e4d]">
            <span className="block mb-1">Correct answer (exact)</span>
            <input
              className="w-full p-2 border border-[#B99652] rounded-none bg-white font-mono text-sm text-[#92400e] font-bold focus:ring-1 focus:ring-[#B99652] outline-none"
              inputMode="decimal"
              placeholder={q.numericFormat === "integer" ? "e.g. 42" : "e.g. 12.5"}
              value={q.numericValue}
              onChange={(e) => set({ numericValue: e.target.value })}
              data-testid={`${idPrefix}-answer`}
            >
            </input>
          </label>
          <p className="sm:col-span-2 text-[11px] text-[#7a705a] leading-relaxed">
            Plain digits only (a leading minus and a decimal point are allowed; no units or commas). Students must enter exactly this value; 2.50 and 2.5 count as the same number.
            {q.numericFormat === "integer" ? " Whole-number questions do not accept decimals." : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {q.options.map((opt, j) => {
            const isRight = q.correct.includes(j);
            return (
              <label
                key={j}
                className={`flex items-center gap-3 p-2.5 rounded-none border transition-all cursor-pointer ${
                  isRight
                    ? "bg-[#fffdf4] border-[#B99652] shadow-xs"
                    : "bg-white border-[#ebdcaa] hover:border-[#ebdcaa]/80"
                }`}
              >
                <input
                  type={q.type === "multi_select" ? "checkbox" : "radio"}
                  name={`${idPrefix}-correct`}
                  checked={isRight}
                  onChange={() => toggleCorrect(j)}
                  className="accent-[#B99652] h-4 w-4"
                  title="Correct answer"
                />
                <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded-none border shrink-0 ${
                  isRight
                    ? "bg-[#B99652] text-white border-[#9b7b3e]"
                    : "bg-[#fffdf4] text-[#665e4d] border-[#ebdcaa]"
                }`}>
                  {LETTERS[j]}
                </span>
                <input
                  className={`flex-1 p-1.5 text-xs sm:text-sm bg-transparent border-b outline-none font-medium ${
                    isRight
                      ? "border-[#B99652] text-[#92400e] font-semibold"
                      : "border-transparent text-[#1e1b4b] focus:border-[#ebdcaa]"
                  }`}
                  placeholder={`Option ${LETTERS[j]}`}
                  value={opt}
                  onChange={(e) => setOption(j, e.target.value)}
                />
              </label>
            );
          })}
          <p className="text-[11px] text-[#7a705a] mt-1">
            {q.type === "multi_select"
              ? `Tick every correct answer (at least two). Students get the mark only if they select exactly these.${q.correct.length < 2 ? ` ${q.correct.length} ticked so far.` : ""}`
              : "Select the one correct answer."}
          </p>
        </div>
      )}

      <textarea
        className="w-full p-2.5 border border-[#ebdcaa] rounded-none bg-white text-xs text-[#665e4d] focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none placeholder:text-[#a09783]"
        rows={2}
        placeholder={explanationPlaceholder}
        value={q.explanation}
        onChange={(e) => set({ explanation: e.target.value })}
      />
    </div>
  );
}
