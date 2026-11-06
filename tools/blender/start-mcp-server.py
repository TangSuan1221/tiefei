"""Blender startup hook: open the MCP socket (port 9876) without clicking the panel button.
Usage: D:\blender\blender.exe assets\blender\navigation-keyboard.blend --python tools\blender\start-mcp-server.py"""
import bpy
def start():
    try:
        bpy.ops.blendermcp.start_server()
        print('MCP server started')
    except Exception as e:
        print('MCP server start failed:', e)
        return 2.0
    return None
bpy.app.timers.register(start, first_interval=1.5)
