import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import client, { errorMessage } from '../api/client';
import { ErrorNote, Field, Modal } from './ui';

/**
 * Config driven form.
 * field: { name, label, type: text|email|password|number|date|time|select|textarea, required, options, optionsFrom, help, min, max, colSpan }
 * optionsFrom: { url, params, label(item), value(item) }
 */
export default function FormModal({ open, title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose, wide }) {
  const [values, setValues] = useState({});
  const [remote, setRemote] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setValues({ ...initial });
    setError('');
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    fields
      .filter((f) => f.optionsFrom)
      .forEach(async (f) => {
        try {
          const { data } = await client.get(f.optionsFrom.url, { params: { limit: 200, ...f.optionsFrom.params } });
          if (!cancelled) {
            setRemote((r) => ({ ...r, [f.name]: data.data.map((item) => ({ value: f.optionsFrom.value(item), label: f.optionsFrom.label(item) })) }));
          }
        } catch (err) {
          if (!cancelled) setError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    const payload = {};
    fields.forEach((f) => {
      const raw = values[f.name];
      if (raw === '' || raw === undefined || raw === null) return;
      payload[f.name] = f.type === 'number' ? Number(raw) : raw;
    });
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(errorMessage(err));
      const mapped = {};
      (err.response?.data?.errors || []).forEach((item) => {
        mapped[item.field] = item.message;
      });
      setFieldErrors(mapped);
    } finally {
      setBusy(false);
    }
  }

  const inputFor = (f) => {
    const id = `f-${f.name}`;
    const common = { id, name: f.name, className: 'input', required: f.required, value: values[f.name] ?? '', onChange: (e) => set(f.name, e.target.value) };
    if (f.type === 'select') {
      const options = f.options || remote[f.name] || [];
      return (
        <select {...common}>
          <option value="">{f.placeholder || 'Select...'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    if (f.type === 'textarea') return <textarea {...common} rows={3} maxLength={f.maxLength} />;
    return <input {...common} type={f.type || 'text'} min={f.min} max={f.max} step={f.step} placeholder={f.placeholder} autoComplete={f.type === 'password' ? 'new-password' : 'off'} />;
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => {} : onClose}
      wide={wide}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="form-modal" className="btn-primary" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <form id="form-modal" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {fields
          .filter((f) => !f.hidden)
          .map((f) => (
            <div key={f.name} className={f.colSpan === 2 || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <Field label={f.label + (f.required ? ' *' : '')} htmlFor={`f-${f.name}`} help={f.help} error={fieldErrors[f.name]}>
                {inputFor(f)}
              </Field>
            </div>
          ))}
      </form>
    </Modal>
  );
}
