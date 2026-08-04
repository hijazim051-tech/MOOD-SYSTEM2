MOOD - UltraMsg automatic WhatsApp patch

Files modified:
- apps/client/src/lib/whatsapp.ts
- apps/client/src/lib/whatsappSettings.ts
- apps/client/src/pages/NewOrder.tsx
- apps/client/src/pages/Orders.tsx
- apps/client/src/pages/Settings.tsx
- supabase/functions/send-ultramsg/index.ts

After copying the files:
1) Deploy the Edge Function:
   npx supabase functions deploy send-ultramsg

2) Build the client:
   cd apps/client
   npm run build

3) Publish:
   cd ../..
   git add .
   git commit -m "Enable automatic WhatsApp messages"
   git push

The secrets must already exist in Supabase:
- ULTRAMSG_INSTANCE_ID
- ULTRAMSG_TOKEN

Automatic messages:
- After saving a new order (when enabled in Settings > WhatsApp)
- When order becomes ready
- When customer collects order
- When order is handed to delegate

PDF note:
- Automatic messages are text messages.
- PDF sharing remains available from the invoice WhatsApp button.
