-- Update the Eco Hub article featured image to a real photo (group clean-up shot)
update public.ngo_articles
set featured_image_url = 'https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/2_d8lzhe.jpg'
where slug = 'supporting-eco-hub-siargao';
