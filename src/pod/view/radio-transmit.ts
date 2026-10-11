/**
 * 自由发言的无线电发射面板：松开实体麦克风（或按 M）后显示在画面下方。
 * 只负责输入与确认；说什么、谁在听、能不能回答，全部由关卡的 radioSay 决定。
 */

type TransmitOptions = {
  target: string;
  choices: readonly string[];
  prefill?: string;
  transcribing?: boolean;
  onSend: (text: string) => void;
  onChoose: (index: number) => void;
  onClose: () => void;
  onDraft?: (text:string) => void;
};

const STYLE_ID = 'radio-tx-style';
const CSS = `
#radio-tx{position:fixed;left:50%;bottom:9%;transform:translateX(-50%);z-index:130;width:min(640px,88vw);padding:16px 18px 12px;
 background:linear-gradient(#0b0f0ce8,#060806f2);border:1px solid #6b5a33;border-radius:6px;box-shadow:0 0 0 1px #000,0 0 28px #f0c47722,inset 0 0 40px #000;
 color:#f0c477;font:16px/1.6 ui-monospace,Consolas,"Microsoft YaHei",monospace;overflow:hidden;text-shadow:0 0 6px #f0c47755}
#radio-tx::after{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,#0000 0 2px,#0006 2px 3px);mix-blend-mode:multiply}
#radio-tx header{display:flex;align-items:center;gap:10px;letter-spacing:.08em;color:#ffe6ad;margin-bottom:10px}
#radio-tx .carrier{width:10px;height:10px;border-radius:50%;background:#ff7a4a;box-shadow:0 0 8px #ff7a4a;animation:radio-tx-blink 1s steps(2,start) infinite}
#radio-tx .status{margin-left:auto;font-size:13px;color:#98783c;letter-spacing:0}
#radio-tx input{box-sizing:border-box;width:100%;padding:9px 11px;background:#020302;border:1px solid #98783c;color:#ffe6ad;font:inherit;font-size:18px;outline:none;caret-color:#ffe6ad;text-shadow:inherit}
#radio-tx input:focus{border-color:#f0c477;box-shadow:0 0 10px #f0c47733}
#radio-tx input::placeholder{color:#6b5a33}
#radio-tx .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#radio-tx .chips button{background:#140f06;border:1px solid #6b5a33;color:#f0c477;font:inherit;font-size:14px;padding:4px 10px;cursor:pointer;text-align:left;text-shadow:inherit}
#radio-tx .chips button:hover,#radio-tx .chips button:focus{background:#2a1f0c;border-color:#f0c477;outline:none}
#radio-tx .hint{margin-top:10px;font-size:13px;color:#98783c;display:flex;justify-content:space-between}
@keyframes radio-tx-blink{to{visibility:hidden}}
`;

export class RadioTransmit {
  private root: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private status: HTMLSpanElement | null = null;
  private dirty = false;
  private opts: TransmitOptions | null = null;

  get open(): boolean { return !!this.root; }

  show(opts: TransmitOptions): void {
    this.close(false);
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; document.head.append(style);
    }
    this.opts = opts; this.dirty = false;
    const root = document.createElement('div'); root.id = 'radio-tx';
    // Keep the native editor visible and clickable for Chinese IME and focus recovery.
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '无线电发射 · ' + opts.target);
    const header = document.createElement('header');
    const carrier = document.createElement('span'); carrier.className = 'carrier';
    const title = document.createElement('span'); title.textContent = `TX · 发送至 ${opts.target}`;
    this.status = document.createElement('span'); this.status.className = 'status';
    header.append(carrier, title, this.status); root.append(header);

    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 80; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('aria-label', '无线电发言');
    input.placeholder = '对着麦克风说的话……'; input.value = opts.prefill ?? '';
    input.addEventListener('input', () => { this.dirty = true;this.opts?.onDraft?.(input.value); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const text = input.value.replace(/\s+/g, ' ').trim();
      if (!text) return;
      const send = this.opts?.onSend; this.close(false); send?.(text);
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input = input; root.append(input);

    if (opts.choices.length) {
      const chips = document.createElement('div'); chips.className = 'chips';
      opts.choices.slice(0, 3).forEach((choice, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = choice;
        b.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this.close(); } });
        b.addEventListener('click', () => { const choose = this.opts?.onChoose; this.close(false); choose?.(i); });
        chips.append(b);
      });
      root.append(chips);
    }
    const hint = document.createElement('div'); hint.className = 'hint';
    const keys = document.createElement('span'); keys.textContent = 'Enter 发送 · Esc 取消';
    const limit = document.createElement('span'); limit.textContent = '≤80 字';
    hint.append(keys, limit); root.append(hint);

    document.body.append(root); this.root = root;
    this.setTranscribing(!!opts.transcribing);
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  }

  /** Recognised speech only fills the line while the player has not started editing it. */
  setTranscript(text: string): void {
    if (!this.input || this.dirty) return;
    this.input.value = text.slice(0, 80);
    this.opts?.onDraft?.(this.input.value);
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
  }

  setTranscribing(on: boolean): void {
    if (this.status) this.status.textContent = on ? '● 转写中…' : '';
  }

  close(notify = true): void {
    if (!this.root) return;
    const onClose = this.opts?.onClose;
    this.root.remove(); this.root = null; this.input = null; this.status = null; this.opts = null;
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    if (notify) onClose?.();
  }
}

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionCtor = new () => Recognition;

/** zh-CN push-to-talk recognition. Silent no-op when the browser lacks it or the player denied the microphone. */
export class PushToTalk {
  private rec: Recognition | null = null;
  private text = '';
  private denied = false;
  onText: ((text: string) => void) | null = null;
  onEnd: (() => void) | null = null;

  get available(): boolean {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return !this.denied && !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  }
  get listening(): boolean { return !!this.rec; }

  start(): void {
    this.abort();
    if (!this.available) return;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
    try {
      const rec = new Ctor(); rec.lang = 'zh-CN'; rec.continuous = true; rec.interimResults = true;
      this.text = '';
      rec.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i]![0]?.transcript ?? '';
        this.text = text.trim(); if (this.text) this.onText?.(this.text);
      };
      rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.denied = true; };
      rec.onend = () => { if (this.rec === rec) this.rec = null; this.onEnd?.(); };
      rec.start(); this.rec = rec;
    } catch { this.rec = null; }
  }

  /** Stop listening but keep the final transcript, which may arrive after release. */
  stop(): void { try { this.rec?.stop(); } catch { this.rec = null; } }
  abort(): void {
    const rec = this.rec; this.rec = null;
    if (rec) { rec.onresult = null; rec.onend = null; try { rec.abort(); } catch { /* already ended */ } }
  }
}
