/* M0 EAN/OCR-B only: XOR contours are separately raster-compared with the source scene. */
const { toContours } = require('./hri-contours.js');
const shifted = (pair) => [pair[0] + 10, pair[1] + 10];
module.exports = function (scene, dpi, point, pathInfo) {
  if (scene.metadata.profileId !== 'm0-hri-spike' || scene.foreground.hex !== '000000')
    throw new Error('Only the admitted EAN/OCR-B HRI fixture is supported');
  return toContours(scene).flatMap((node) =>
    node.contours.map((contour) =>
      pathInfo(
        contour.map((p) =>
          point(p.anchor[0] + 10, p.anchor[1] + 10, dpi, shifted(p.left), shifted(p.right)),
        ),
      ),
    ),
  );
};
