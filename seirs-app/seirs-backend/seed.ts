/**
 * Seirs Production Seed
 * Wipes all user data and inserts the 4 real accounts.
 *
 * Run: npx ts-node --project tsconfig.json seed.ts
 */
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const DB: any = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host:     process.env.DB_HOST     ?? 'localhost',
      port:     Number(process.env.DB_PORT ?? 5432),
      user:     process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'Whoareyoupls80#',
      database: process.env.DB_NAME     ?? 'seirs_db',
    };

const hash = (pw: string) => bcrypt.hash(pw, 12);

// ── Accounts ──────────────────────────────────────────────────────────────────
// Change these passwords immediately after first login.
const USERS = [
  {
    email: 'oyadeyio761@gmail.com',
    name:  'Oluwaseye Israel Oyadeyi',
    phone: '08000000001',
    role:  'driver',
    password: 'Ibadan80#',
    vehicleType:  'motorcycle',
    vehiclePlate: 'LAG-001-AA',
    status:       'approved',
  },
  {
    email: 'oyadeyio762@gmail.com',
    name:  'Oluwaseye Israel Oyadeyi',
    phone: '08000000002',
    role:  'customer',
    password: 'Ibadan80#',
  },
  {
    email: 'seirs.app@gmail.com',
    name:  'Oluwaseye Israel Oyadeyi',
    phone: '08000000003',
    role:  'customer',
    password: 'Ibadan80#',
  },
  {
    email: 'admin@seirs.co',
    name:  'Oluwaseye Israel Oyadeyi',
    phone: '08000000000',
    role:  'admin',
    password: 'Ibadan80#',
  },
] as const;

async function seed() {
  const client = new Client(DB);
  await client.connect();
  console.log('\n🌱  Connected to', DB.database, '\n');

  // ── 1. Wipe existing data (order matters for FK constraints) ──────────────
  console.log('🗑   Wiping existing data...');
  await client.query(`
    TRUNCATE TABLE
      notifications,
      payments,
      wallets,
      partner_deliveries,
      deliveries,
      drivers,
      fraud_flags,
      users
    RESTART IDENTITY CASCADE
  `);
  console.log('    Done.\n');

  // ── 2. Insert users ───────────────────────────────────────────────────────
  for (const u of USERS) {
    const userId = randomUUID();
    const pw     = await hash(u.password);

    await client.query(
      `INSERT INTO users (id, name, email, phone, password, role, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())`,
      [userId, u.name, u.email, u.phone, pw, u.role],
    );

    // Create driver profile for driver accounts
    if (u.role === 'driver') {
      const d = u as typeof USERS[0];
      await client.query(
        `INSERT INTO drivers (id, "userId", "vehicleType", "vehiclePlate", status, "isOnline",
          "lastLat", "lastLng", rating, "totalDeliveries", "walletBalance", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, false, 6.5244, 3.3792, 5.0, 0, 0, NOW(), NOW())`,
        [randomUUID(), userId, d.vehicleType, d.vehiclePlate, d.status],
      );
      console.log(`  ✓ driver    ${u.email}  [${d.status}]  pass: ${u.password}`);
    } else {
      console.log(`  ✓ ${u.role.padEnd(8)}  ${u.email}  pass: ${u.password}`);
    }
  }

  await client.end();

  console.log(`
✅  Seed complete.

⚠️  IMPORTANT — change these passwords immediately after first login:
    oyadeyio761@gmail.com  →  Seirs@Driver1
    oyadeyio762@gmail.com  →  Seirs@User762
    seirs.app@gmail.com    →  Seirs@AppGmail
    admin@seirs.co         →  Seirs@Admin2024

    Admin dashboard: http://localhost:3000/admin/admin.html
`);
}

seed().catch(err => { console.error(err); process.exit(1); });
