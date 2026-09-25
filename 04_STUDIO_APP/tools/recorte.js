// Recorta la persona u objeto principal de una foto con Vision de macOS y guarda un PNG transparente.
// Uso: osascript -l JavaScript tools/recorte.js entrada.png salida.png [personas]
// Con "personas", solo recorta si Vision detecta al menos una cara (si no, termina con error y no crea archivo).
ObjC.import('Foundation');
ObjC.import('AppKit');
ObjC.import('Vision');
ObjC.import('CoreImage');

function run(argv) {
  const [src, dest, mode] = argv;
  const url = $.NSURL.fileURLWithPath(src);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}));
  const req = $.VNGenerateForegroundInstanceMaskRequest.alloc.init;
  const err = Ref();
  if (mode === 'personas') {
    const human = $.VNDetectFaceRectanglesRequest.alloc.init;
    if (!handler.performRequestsError($([human]), err)) throw new Error('Vision falló: ' + err[0]);
    // Solo caras claras: confianza alta y al menos 5% del alto de la foto (evita falsos positivos en manos u objetos)
    let faces = 0;
    for (let k = 0; k < (human.results ? human.results.count : 0); k++) {
      const f = human.results.objectAtIndex(k);
      if (f.confidence >= 0.8 && f.boundingBox.size.height >= 0.05) faces++;
    }
    if (!faces) throw new Error('No hay una cara en la foto');
  }
  if (!handler.performRequestsError($([req]), err)) throw new Error('Vision falló: ' + err[0]);
  const results = req.results;
  if (!results || results.count === 0) throw new Error('No se encontró un sujeto en la foto');
  const obs = results.objectAtIndex(0);
  const buf = obs.generateMaskedImageOfInstancesFromRequestHandlerCroppedToInstancesExtentError(obs.allInstances, handler, false, err);
  if (!buf) throw new Error('No se pudo generar el recorte: ' + err[0]);
  const ci = $.CIImage.imageWithCVPixelBuffer(buf);
  const rep = $.NSCIImageRep.imageRepWithCIImage(ci);
  const img = $.NSImage.alloc.initWithSize(rep.size);
  img.addRepresentation(rep);
  const tiff = img.TIFFRepresentation;
  const bmp = $.NSBitmapImageRep.imageRepWithData(tiff);
  const png = bmp.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  if (!png.writeToFileAtomically(dest, true)) throw new Error('No se pudo escribir ' + dest);
  return 'ok ' + rep.size.width + 'x' + rep.size.height;
}
