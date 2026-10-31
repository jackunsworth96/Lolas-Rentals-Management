import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export async function sendTestWhatsApp(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args, options: { send: { type: 'boolean', default: false } }, allowPositionals: true,
  });
  const [phone, name = 'Test Guest', pickupTime = '9:00 AM'] = positionals;
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone) || positionals.length > 3 || !name.trim() || !pickupTime.trim()) {
    throw new Error('Usage: npm run whatsapp:test -w apps/api -- +639171234567 "Your Name" "9:00 AM" [--send]');
  }

  // Import first so the existing Supabase client loads the server .env files.
  const { getSupabaseClient } = await import('../src/adapters/supabase/client.js');
  const { sendWhatsAppTemplate, renderTemplate } = await import('../src/services/whatsapp-template.js');
  const { PICKUP_REMINDER_TEMPLATE_NAME, PICKUP_REMINDER_TEMPLATE_LANGUAGE, PICKUP_REMINDER_TEMPLATE_BODY } =
    await import('../src/jobs/pickup-reminder.job.js');
  const input = {
    operationKey: `manual-test:pickup-reminder:${phone}`,
    phone,
    templateName: PICKUP_REMINDER_TEMPLATE_NAME,
    languageCode: PICKUP_REMINDER_TEMPLATE_LANGUAGE,
    bodyText: PICKUP_REMINDER_TEMPLATE_BODY,
    parameters: [name.trim(), pickupTime.trim()],
  };
  console.log(`Recipient: ${phone}\nTemplate: ${input.templateName} (${input.languageCode})\nTest key: ${input.operationKey}`);
  console.log(renderTemplate(input.bodyText, input.parameters));
  if (!values.send) {
    console.log('Preview only. Add --send to send this template to Meta and report it to LoloDesk.');
    return;
  }

  // Explicit --send enables the real sender without starting the server or scheduled jobs.
  process.env.NODE_ENV = 'production';
  await sendWhatsAppTemplate(input);
  const { data, error } = await getSupabaseClient().from('whatsapp_template_sends')
    .select('operation_key, external_message_id, sent_at, reported_at')
    .eq('operation_key', input.operationKey).single();
  if (error || !data) throw new Error(`Could not check the saved send: ${error?.message ?? 'missing record'}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(data.reported_at
    ? 'Meta accepted the message and LoloDesk confirmed the report. Check WhatsApp and the LoloDesk inbox or review queue.'
    : 'Meta accepted the message. The LoloDesk report is pending; the deployed API retries reports every five minutes.');
  console.log('Rerunning this command with the same number will not send a second message.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sendTestWhatsApp(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
