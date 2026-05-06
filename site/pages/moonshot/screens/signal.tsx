// SIGNAL — a console for sending a message into the void. Three fields
// (Name, Channel, Message). The visible text is rasterized particles; the
// caret + IME live in invisible <input>/<textarea> elements layered over
// the field bounds (RFC §4.3 IME bridge).
//
// Submit fires a radial impulse from the screen center — the message
// "transmits" outward — then the form re-coalesces in a sent state.

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useScene } from '../engine/scene';
import { useCanvas } from '../engine/canvas';
import { column, cta, fieldNode } from '../components/builders';
import type { SceneNode } from 'screean';

type FieldId = 'name' | 'channel' | 'message';

type FormState = {
  readonly name: string;
  readonly channel: string;
  readonly message: string;
  readonly focused: FieldId | null;
  readonly transmitting: boolean;
  readonly sent: boolean;
};

const FIELD_W = 560;
const SUBMIT_W = 280;
const SUBMIT_H = 72;

const buildSignal = (
  w: number,
  h: number,
  state: FormState,
): SceneNode => {
  const nameField = fieldNode({
    label: '01  ·  YOUR NAME',
    value: state.name,
    placeholder: 'Ada Lovelace',
    width: FIELD_W,
    focused: state.focused === 'name',
  });
  const channelField = fieldNode({
    label: '02  ·  CHANNEL',
    value: state.channel,
    placeholder: 'frequency.you@reach.me',
    width: FIELD_W,
    focused: state.focused === 'channel',
  });
  const messageField = fieldNode({
    label: '03  ·  MESSAGE',
    value: state.message,
    placeholder: 'Begin transmission…',
    width: FIELD_W,
    focused: state.focused === 'message',
  });

  const submit = cta({
    label: state.transmitting ? 'TRANSMITTING…' : state.sent ? 'SENT  ·  AGAIN?' : 'TRANSMIT  →',
    variant: 'primary',
    width: SUBMIT_W,
    height: SUBMIT_H,
    pulse: state.transmitting ? 1 : 0,
  });

  void w; void h;
  const fields = column({ gap: 28, align: 'start' }, [nameField, channelField, messageField]);
  return column({ gap: 36, align: 'center' }, [fields, submit]);
};

// Field mirror — a real <input> sized to the field's visual bounds. opacity:0
// keeps it focusable + IME-attachable. The transparent native caret is
// hidden via CSS; particles show the value (no live caret in v1 — that's a
// pretext-blocked feature per RFC §4.1).
type FieldMirrorProps = {
  readonly id: FieldId;
  readonly index: number;       // vertical position in stack
  readonly value: string;
  readonly placeholder: string;
  readonly multiline?: boolean;
  readonly onChange: (v: string) => void;
  readonly onFocus: (id: FieldId) => void;
  readonly onBlur: () => void;
};

// The fieldNode column is now value(36px) + rule(3px) with gap=14 → ~53px tall.
// FIELD_H below reflects that so mirror inputs sit precisely on the rendered
// value. Tweak when fieldNode's typography changes.
const FIELD_H = 53;
const FIELD_STACK_GAP = 28;
const FIELD_STACK_TOP_OFFSET = -160;

const LABEL_FOR: Record<FieldId, string> = {
  name:    '01  /  YOUR NAME',
  channel: '02  /  CHANNEL',
  message: '03  /  MESSAGE',
};

const FieldMirror = ({
  id, index, value, placeholder, multiline, focused, onChange, onFocus, onBlur,
}: FieldMirrorProps & { focused: boolean }): ReactNode => {
  const { viewport } = useCanvas();
  const left = viewport.w / 2 - FIELD_W / 2;
  const top = viewport.h / 2 + FIELD_STACK_TOP_OFFSET + index * (FIELD_H + FIELD_STACK_GAP);
  const Comp = multiline ? 'textarea' : 'input';
  return (
    <>
      {/* DOM label — positioned just above the rasterized value. Mono caps
          chrome that doesn't compete for particle budget. */}
      <span
        className="moonshot-field-label"
        data-focused={focused ? 'true' : undefined}
        style={{ left, top: top - 18 }}
      >
        {LABEL_FOR[id]}
      </span>
      <Comp
        className="moonshot-input"
        style={{ left, top, width: FIELD_W, height: FIELD_H, resize: 'none' }}
        type={multiline ? undefined : 'text'}
        value={value}
        placeholder={placeholder}
        aria-label={id}
        onChange={(e) => onChange((e.target as HTMLInputElement | HTMLTextAreaElement).value)}
        onFocus={() => onFocus(id)}
        onBlur={onBlur}
      />
    </>
  );
};

export const Signal = (): ReactNode => {
  const { impulse, viewport } = useCanvas();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('');
  const [message, setMessage] = useState('');
  const [focused, setFocused] = useState<FieldId | null>(null);
  const [transmitting, setTransmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const sendingRef = useRef(false);

  const state: FormState = { name, channel, message, focused, transmitting, sent };
  const buildFn = useMemo(
    () => (w: number, h: number) => buildSignal(w, h, state),
    // Every state change matters — list each.
    [name, channel, message, focused, transmitting, sent], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useScene('signal', buildFn, [name, channel, message, focused, transmitting, sent]);

  const submit = useCallback(() => {
    if (sendingRef.current) {
      // Reset for a fresh send cycle.
      sendingRef.current = false;
      setSent(false);
      setTransmitting(false);
      setName('');
      setChannel('');
      setMessage('');
      return;
    }
    sendingRef.current = true;
    setTransmitting(true);
    impulse(viewport.w / 2, viewport.h / 2, 1100);
    window.setTimeout(() => {
      setTransmitting(false);
      setSent(true);
    }, 700);
  }, [impulse, viewport.w, viewport.h]);

  // Submit-button mirror — a button (not Link); same hit-area shape as CTA.
  const submitLeft = viewport.w / 2 - SUBMIT_W / 2;
  // Submit Y: under the 3 fields. column gap=36, fields height ~3*FIELD_H + 2*FIELD_STACK_GAP.
  const fieldsBlockH = 3 * FIELD_H + 2 * FIELD_STACK_GAP;
  const submitTop = viewport.h / 2 + FIELD_STACK_TOP_OFFSET + fieldsBlockH + 36 + 8;

  return (
    <>
      <FieldMirror id="name"    index={0} value={name}    placeholder="Ada Lovelace"     focused={focused === 'name'}    onChange={setName}    onFocus={setFocused} onBlur={() => setFocused(null)} />
      <FieldMirror id="channel" index={1} value={channel} placeholder="frequency.you@reach.me" focused={focused === 'channel'} onChange={setChannel} onFocus={setFocused} onBlur={() => setFocused(null)} />
      <FieldMirror id="message" index={2} value={message} placeholder="Begin transmission…" focused={focused === 'message'} multiline onChange={setMessage} onFocus={setFocused} onBlur={() => setFocused(null)} />
      <button
        type="button"
        className="moonshot-cta"
        style={{ left: submitLeft, top: submitTop, width: SUBMIT_W, height: SUBMIT_H, border: 'none', cursor: 'pointer' }}
        onClick={submit}
        aria-label={sent ? 'Send another' : transmitting ? 'Transmitting' : 'Transmit'}
      >
        <span className="moonshot-vh">Transmit</span>
      </button>
      <h1 className="moonshot-vh">Signal — compose and transmit a message</h1>
    </>
  );
};
