import bpy, os, json
from mathutils import Vector
src='/Applications/Wakppu.app/Wrapper/Wakppu.app'
out='/private/tmp/manzizak-fidget-reference-assets/models'
report={}
for name in ['cheese','mango','peachmochi','bread']:
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
 for image in list(bpy.data.images):
  if image.name not in ['Render Result','Viewer Node']: bpy.data.images.remove(image)
 for material in list(bpy.data.materials): bpy.data.materials.remove(material)
 bpy.ops.wm.usd_import(filepath=f'{src}/{name}.usdz', import_cameras=False, import_lights=False)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 for o in meshes:
  bpy.context.view_layer.objects.active=o
  o.select_set(True)
  if len(o.data.polygons)>7000:
   mod=o.modifiers.new('Mobile topology','DECIMATE'); mod.ratio=min(1,6000/len(o.data.polygons)); bpy.ops.object.modifier_apply(modifier=mod.name)
  for p in o.data.polygons:p.use_smooth=True
 # retain authored orientation; normalization is performed in Three.js
 bpy.ops.export_scene.gltf(filepath=f'{out}/{name}.glb',export_format='GLB',use_selection=False,export_cameras=False,export_lights=False)
 report[name]={'meshes':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'bounds':[[list(o.matrix_world@Vector(c)) for c in o.bound_box] for o in meshes]}
open('/private/tmp/manzizak-reference-models.json','w').write(json.dumps(report))
