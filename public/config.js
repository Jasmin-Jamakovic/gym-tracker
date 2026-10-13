// Supabase project URL and public (anon / publishable) key, from Project Settings -> API.
// This key is public by design: Row Level Security protects the data.
// Never put the service_role / secret key here.
window.GYM_CONFIG = {
  supabaseUrl: 'https://<project-ref>.supabase.co',
  supabaseKey: '<anon or publishable key>',
  // people log in with a username; Supabase stores it as <username>@<usernameDomain>.
  // No email is ever sent there. If Supabase says the address is invalid, use a domain you own.
  usernameDomain: 'gym-tracker.invalid',
};
