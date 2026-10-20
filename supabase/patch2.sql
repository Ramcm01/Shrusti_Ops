-- Run once in the Supabase SQL editor, after ops_schema.sql.

-- Attendance date should follow Indian time, not UTC
alter table attendance alter column work_date set default ((now() at time zone 'Asia/Kolkata')::date);

-- Live chat updates (used by the chat screen in the next release)
alter publication supabase_realtime add table chat_messages;
