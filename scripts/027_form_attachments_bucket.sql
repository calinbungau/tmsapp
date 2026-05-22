-- Create storage bucket for form attachments (photos, signatures, files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-attachments', 'form-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'form-attachments');

-- Allow public reads
CREATE POLICY "Allow public reads form-attachments" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'form-attachments');

-- Allow authenticated deletes on own uploads
CREATE POLICY "Allow authenticated deletes form-attachments" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'form-attachments');
