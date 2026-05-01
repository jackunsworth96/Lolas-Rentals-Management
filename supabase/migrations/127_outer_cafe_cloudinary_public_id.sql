-- Outer Cafe logo was re-uploaded to Cloudinary; public ID changed from outer-cafe_ykizor to outer-cafe_2_zxrcnb.
UPDATE paw_card_establishments AS e
SET    cloudinary_public_id = 'outer-cafe_2_zxrcnb'
WHERE  trim(both '-' from regexp_replace(lower(e.name), '[^a-z0-9]+', '-', 'g')) = 'outer-cafe'
   OR  e.cloudinary_public_id = 'outer-cafe_ykizor';
