import { pgTable, serial, text, integer, timestamp, jsonb, boolean, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const students = pgTable(
  'students',
  {
    id: serial('id').primaryKey(),
    nisn: varchar('nisn', { length: 32 }).notNull(),
    name: text('name').notNull(),
    birth_place: text('birth_place').default('').notNull(),
    birth_date: varchar('birth_date', { length: 10 }).notNull(),
    class: varchar('class', { length: 64 }).default('').notNull(),
    major: varchar('major', { length: 128 }).default('').notNull(),
    status_graduation: integer('status_graduation').default(1).notNull(),
    viewed_at: timestamp('viewed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    nisnUx: uniqueIndex('students_nisn_ux').on(t.nisn),
    classIdx: index('students_class_idx').on(t.class),
  }),
);

export const settings = pgTable('settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value').default('').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const galleries = pgTable('galleries', {
  id: serial('id').primaryKey(),
  image_path: text('image_path').notNull(),
  title: varchar('title', { length: 200 }).default('').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const importArchives = pgTable('import_archives', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  imported: integer('imported').default(0).notNull(),
  failed: integer('failed').default(0).notNull(),
  total_after: integer('total_after').default(0).notNull(),
  errors: jsonb('errors').$type<string[]>().default([]).notNull(),
  snapshot: jsonb('snapshot').$type<unknown[]>().default([]).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type StudentRow = typeof students.$inferSelect;
export type GalleryRow = typeof galleries.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type ImportArchiveRow = typeof importArchives.$inferSelect;
