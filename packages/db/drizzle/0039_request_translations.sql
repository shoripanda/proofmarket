-- Request text in more than one language (01 §4.31, 2026-11-17). The requester may send the question, the
-- acceptance criteria and display labels for choices and form fields in Japanese and English; workers see the
-- version for their language. Display only: answers are still stored with the original values and keys, and the
-- evidence bundle still hashes the original question. Null for every existing request.
ALTER TABLE verification_requests ADD COLUMN translations jsonb;
