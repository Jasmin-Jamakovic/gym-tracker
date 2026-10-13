// The one Supabase client. The URL and public key come from config.js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';

const cfg = window.GYM_CONFIG || {};
export const configured = /^https:\/\/[^<]+$/.test(cfg.supabaseUrl || '') && !!cfg.supabaseKey && !cfg.supabaseKey.includes('<');

export const supabase = configured
  ? createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  : null;

// handy for the isolation tests in the browser console
if (supabase) window.supabase = supabase;
