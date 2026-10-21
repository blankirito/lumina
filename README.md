# Lumina

> A multi-tenant ecommerce platform for independent merchants — from storefront and checkout to merchant operations, subscriptions, and platform administration.

**Lumina** 是一个面向独立商家的多租户电商平台。每个商家可管理自己的商品、订单、顾客、收款方式与商店资料；平台管理员则可审核商家申请与订阅付款。

## Highlights

- Multi-tenant storefronts with store-specific URLs
- Merchant admin portal for products, orders, customers, analytics, and settings
- Customer shopping flow: cart, checkout, saved addresses, wishlist, order tracking
- Offline payment methods with optional QR-code upload
- Product images, categories, stock management, and order fulfilment workflows
- Merchant onboarding with trial, paid subscription, and complimentary access states
- Manual TNG subscription-payment workflow with platform review and approval
- Platform admin portal for merchant applications, subscriptions, and payment requests
- Order notifications with unread/read history
- Protected subscription lifecycle reconciliation through Vercel Cron

## Product Areas

| Area | What it supports |
| --- | --- |
| Storefront | Browse products, search, cart, checkout, profiles, saved addresses, wishlist, and order tracking |
| Merchant Admin | Product management, inventory, order processing, customers, analytics, payment methods, store profile, and notifications |
| Platform Admin | Merchant review, subscription management, manual TNG payment approval, complimentary access, and store suspension controls |
| Subscription Lifecycle | Trial periods, paid access periods, payment grace periods, dashboard reminders, and automatic suspension |

## Tech Stack

- [Next.js 16](https://nextjs.org/) with App Router
- TypeScript
- React 19
- Supabase Auth, Postgres, Storage, and Row Level Security
- Tailwind CSS
- Vercel deployment and Cron Jobs
- Vitest

## Architecture

Lumina separates access and data by store.

- **Customers** use public storefront routes such as `/store/[slug]`.
- **Merchant owners and admins** use `/admin` to operate their own store.
- **Platform administrators** use `/platform` to manage merchant applications and subscriptions.
- Supabase Row Level Security and server-side authorization protect store-scoped data.
- Subscription entitlement is stored separately from merchant applications so trial, paid, grace, suspended, and complimentary states remain explicit.

## Manual TNG Subscription Flow

Lumina currently supports a manual subscription-payment workflow:

1. A merchant chooses a 1-, 3-, or 12-month subscription period.
2. The merchant transfers through TNG and submits their payer name and transfer reference.
3. A platform administrator verifies the transfer outside the application.
4. The administrator approves or rejects the request.
5. Approval extends access from the later of the current expiry date or the approval date.

No card details are collected by Lumina in this flow.

## Local Development

### Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project

### Install

```bash
git clone <your-repository-url>
cd lumina
npm install
```

### Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

CRON_SECRET=

TNG_RECIPIENT_NAME=
TNG_RECIPIENT_NUMBER=
```

Never commit `.env.local`, service-role credentials, cron secrets, TNG recipient details, or personal data.

### Database setup

Apply the SQL files in `supabase/migrations/` to your Supabase project in filename order.

The latest subscription and settings migrations are:

```text
041_manual_tng_subscription_requests.sql
042_reconcile_paid_subscription_expiry.sql
043_update_store_profile_rpc.sql
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Checks

```bash
npm test
npm run build
```

Latest verified result:

- 72 test files passed
- 207 tests passed
- Production build passed

## Deployment

Lumina is configured for Vercel deployment.

- Add all required environment variables to the Production environment.
- Deploy from the production branch.
- Vercel Cron calls `/api/cron` daily to reconcile subscription lifecycle states.
- Confirm that `CRON_SECRET` is configured before relying on automated lifecycle updates.

## Roadmap

- Team and permission management
- Delivery and shipping configuration
- Expanded merchant notification preferences
- Additional payment-provider integrations
- Further reporting and analytics improvements

## Security Notes

- Store access is scoped through Supabase Row Level Security.
- Sensitive updates use authenticated server actions and protected database functions.
- Manual subscription approval is restricted to platform administrators.
- Do not expose Supabase secret keys, cron secrets, transfer references, TNG recipient details, or customer data in commits, screenshots, or issues.

## License

No license has been specified yet.
