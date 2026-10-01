"""
Generate low-poly placeholder meshes for Schild / Bogen / Reiter / Source.
Run: blender --background --python assets/blender/scripts/generate_placeholders.py
No gameplay data — visual placeholders only.
"""
import math
import os
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_CHAR = os.path.join(ROOT, "characters")
OUT_SRC = os.path.join(ROOT, "sources")
os.makedirs(OUT_CHAR, exist_ok=True)
os.makedirs(OUT_SRC, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)


def export_fbx(path):
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=False,
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Y",
        axis_up="Z",
    )


def add_body(height=1.8, radius=0.22):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height * 0.55, location=(0, 0, height * 0.45))
    body = bpy.context.active_object
    body.name = "Body"
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius * 0.85, location=(0, 0, height * 0.85))
    head = bpy.context.active_object
    head.name = "Head"
    return body


def make_schild():
    clear_scene()
    add_body()
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.28, 0, 1.05))
    shield = bpy.context.active_object
    shield.name = "ShieldPlate"
    shield.scale = (0.08, 0.55, 0.7)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(0.36, 0, 1.05))
    bpy.context.active_object.name = "ShieldBoss"
    export_fbx(os.path.join(OUT_CHAR, "SM_Schild_Placeholder.fbx"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_CHAR, "SM_Schild_Placeholder.blend"))


def make_bogen():
    clear_scene()
    add_body(height=1.85, radius=0.18)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.35, minor_radius=0.03, location=(-0.25, 0, 1.15), rotation=(0, math.pi / 2, 0)
    )
    bpy.context.active_object.name = "Bow"
    bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=0.25, location=(0.22, -0.12, 1.0))
    bpy.context.active_object.name = "Quiver"
    export_fbx(os.path.join(OUT_CHAR, "SM_Bogen_Placeholder.fbx"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_CHAR, "SM_Bogen_Placeholder.blend"))


def make_reiter():
    clear_scene()
    # horse body
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.9))
    horse = bpy.context.active_object
    horse.name = "HorseBody"
    horse.scale = (1.2, 0.35, 0.45)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.7, location=(-0.45, 0.18, 0.4))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.7, location=(-0.45, -0.18, 0.4))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.7, location=(0.45, 0.18, 0.4))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.7, location=(0.45, -0.18, 0.4))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0.75, 0, 1.05))
    bpy.context.active_object.name = "HorseHead"
    # rider
    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.7, location=(0, 0, 1.45))
    bpy.context.active_object.name = "Rider"
    export_fbx(os.path.join(OUT_CHAR, "SM_Reiter_Placeholder.fbx"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_CHAR, "SM_Reiter_Placeholder.blend"))


def make_source():
    clear_scene()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=0.25, location=(0, 0, 0.12))
    bpy.context.active_object.name = "WellBase"
    bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.08, location=(0, 0, 0.35))
    bpy.context.active_object.name = "WellRim"
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=1.2, location=(0.35, 0, 0.9))
    bpy.context.active_object.name = "BannerPole"
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.55, 0, 1.25))
    flag = bpy.context.active_object
    flag.name = "BannerCloth"
    flag.scale = (0.35, 0.02, 0.25)
    bpy.ops.object.transform_apply(scale=True)
    export_fbx(os.path.join(OUT_SRC, "SM_Source_Well.fbx"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_SRC, "SM_Source_Well.blend"))


if __name__ == "__main__":
    make_schild()
    make_bogen()
    make_reiter()
    make_source()
    print("Placeholders written to", OUT_CHAR, OUT_SRC)
