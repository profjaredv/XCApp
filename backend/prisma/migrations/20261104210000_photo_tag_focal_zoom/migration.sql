-- How tightly cropped a photo is within its collage slot, per tag (same
-- place focal_x/focal_y already live, for the same reason — it survives a
-- photo swap-out/swap-back). Null means the default cover-fit, no zoom.
ALTER TABLE "photo_athletes" ADD COLUMN "focal_zoom" DOUBLE PRECISION;
