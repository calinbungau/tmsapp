-- Create storage bucket for inspection photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('inspection-photos', 'inspection-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT USING (bucket_id = 'inspection-photos');

-- Allow authenticated uploads (or you can make it public for anonymous)
CREATE POLICY "Allow uploads" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'inspection-photos');

-- Allow updates
CREATE POLICY "Allow updates" ON storage.objects
FOR UPDATE USING (bucket_id = 'inspection-photos');

-- Allow deletes
CREATE POLICY "Allow deletes" ON storage.objects
FOR DELETE USING (bucket_id = 'inspection-photos');
