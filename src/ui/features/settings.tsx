import { useState } from 'react';
import { intervals, providerIds, providerNames, type MonitorState, type Preferences, type ProviderId, type Subscription } from '../../shared/contracts.js';
import { Button, Card, Field, Toggle } from '../components/controls.js';

const fieldStyle = 'mt-2 block w-full rounded-md border border-edge bg-field p-2 text-foreground';
const heading = 'text-sm font-semibold';
const windowsSettings = [
  ['startup', 'Launch at Windows startup'],
  ['startMinimized', 'Hide to tray on Windows startup'],
  ['closeToTray', 'Keep running when closed'],
  ['notifications', 'Desktop renewal notifications']
] as const;

function SubscriptionForm({ id, saved, save }: { id: ProviderId; saved: Subscription; save(entry: Subscription): void }) {
  const [entry, setEntry] = useState(saved);
  const change = (patch: Partial<Subscription>) => setEntry(current => ({ ...current, ...patch }));
  const dirty = entry.plan !== saved.plan || entry.anchor !== saved.anchor || entry.cycle !== saved.cycle || entry.reminder !== saved.reminder;
  return <Card>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); save(entry); }}>
      <h2 className={heading}>{providerNames[id]} renewal</h2>
      <Field title="Plan name"><input className={fieldStyle} value={entry.plan} maxLength={80} onChange={event => change({ plan: event.target.value })}/></Field>
      <Field title="Billing cycle"><select className={fieldStyle} value={entry.cycle} onChange={event => change({ cycle: event.target.value === 'yearly' ? 'yearly' : 'monthly' })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
      <Field title="Next renewal date"><input className={fieldStyle} type="date" value={entry.anchor} min="1900-01-01" max="9999-12-31" onChange={event => change({ anchor: event.target.value })}/></Field>
      <Toggle title="Remind me on the expected renewal date" checked={entry.reminder} onChange={reminder => change({ reminder })}/>
      <Button type="submit" disabled={!dirty}>Save renewal</Button>
    </form>
  </Card>;
}

interface Props {
  data: MonitorState;
  onSave(settings: Preferences): void;
  onLogs(): void;
  onReset(): void;
  onQuit(): void;
}

export function Settings({ data, onSave, onLogs, onReset, onQuit }: Props) {
  const { settings } = data;
  const update = (patch: Partial<Preferences>) => onSave({ ...settings, ...patch });
  return <>
    <h1 className="text-[25px] font-semibold tracking-tight">Settings</h1>
    <Card className="space-y-3">
      <h2 className={heading}>Monitoring</h2>
      <Field title="Refresh interval">
        <select className={fieldStyle} value={settings.interval} onChange={event => {
          const interval = intervals.find(option => option === Number(event.target.value));
          if (interval !== undefined) update({ interval });
        }}>
          {intervals.map(option => <option key={option} value={option}>{option ? option + ' minutes' : 'Manual only'}</option>)}
        </select>
      </Field>
      <Toggle title="Pause automatic refresh" checked={settings.paused} onChange={paused => update({ paused })}/>
      {providerIds.map(id => <Toggle key={id} title={'Monitor ' + providerNames[id]} checked={!settings.disabled[id]} onChange={enabled => update({ disabled: { ...settings.disabled, [id]: !enabled } })}/>)}
    </Card>
    <Card className="space-y-3">
      <h2 className={heading}>Windows</h2>
      {windowsSettings.map(([key, label]) => <Toggle key={key} title={label} checked={settings[key]} onChange={value => update({ [key]: value })}/>)}
    </Card>
    {providerIds.map(id => <SubscriptionForm key={id + JSON.stringify(settings.subscriptions[id])} id={id} saved={settings.subscriptions[id]} save={entry => update({ subscriptions: { ...settings.subscriptions, [id]: entry } })}/>)}
    <Card className="space-y-2">
      <h2 className={heading}>Diagnostics</h2>
      <p className="text-xs text-muted">Background worker {data.worker ? 'active' : 'offline'}</p>
      <div className="flex flex-wrap gap-2"><Button onClick={onLogs}>Open logs</Button><Button onClick={onReset}>Reset preferences</Button></div>
    </Card>
    <Card className="space-y-2"><h2 className={heading}>AI Usage Monitor {data.version}</h2><p className="text-xs leading-relaxed text-muted">Independent subscription monitoring through the CLIs on your Windows PATH. Manage accounts in the provider CLIs.</p></Card>
    <Button onClick={onQuit}>Quit application</Button>
  </>;
}
