import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;
const SERVER_SUPABASE_TIMEOUT_MS = 12000;

function fetchWithTimeout(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_SUPABASE_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal })
    .catch((error) => {
      if (error instanceof Error && /abort|signal/i.test(error.message)) {
        throw new Error("Supabase nao respondeu. Verifique se o projeto esta ativo e as chaves estao corretas.");
      }
      throw error;
    })
    .finally(() => clearTimeout(timeout));
}

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!serverClient) {
    serverClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithTimeout }
    });
  }
  return serverClient;
}
