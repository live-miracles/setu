-- Inventory and request images are intentionally public static assets. Public
-- buckets bypass read authorization while storage mutations remain protected.
update storage.buckets
set public = true
where id = 'request-images';
