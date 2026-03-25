import { google, type sheets_v4 } from 'googleapis';

let sheetsClient: sheets_v4.Sheets | null = null;

function getAuth() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentials) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');

  const parsed = JSON.parse(credentials);
  return new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: 'v4', auth: getAuth() });
  }
  return sheetsClient;
}

export async function readSheet(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (response.data.values as string[][]) ?? [];
}

export async function writeSheet(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

export async function appendSheet(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}
