-- Fix Eco Hub Siargao Instagram URL (correct handle is ecohub.siargao)
update public.ngos
set website_url = 'https://www.instagram.com/ecohub.siargao/'
where slug = 'eco-hub-siargao';
