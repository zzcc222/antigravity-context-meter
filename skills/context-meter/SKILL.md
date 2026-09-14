---
name: context-meter
description: >-
  Antigravity 上下文流光长条组件的管理与诊断技能。
  当用户询问如何查看上下文占用、重新安装/部署上下文长条组件，或诊断上下文微服务状态时激活此技能。
---

# Antigravity Context Meter Skill

本技能为 Antigravity 对话框顶部上下文流光长条组件的管理与维护技能。

## 功能特性
1. **输入框正上方像素级对齐**：紧贴输入框上方，随输入框文字行数变化自适应上下浮动。
2. **多层动态霓虹流光**：外框 360° 彩虹动效边框 + 轨道白金激光掠影 + 呼吸状态灯。
3. **精准模块切分**：工具调用、智能体回复、思考推理、用户提问、系统规则与工件 6 大分类实时估算与占比。
4. **跨项目多会话动态联动**：根据用户在侧边栏点击选中的项目/会话实时切换对应统计数据。
5. **设置页智能隐退与模型菜单无阻**：进入设置页自动隐去，模型下拉菜单自然浮于上层。

## 常用操作指令

### 1. 检查服务健康状态
```powershell
node -e "const http = require('http'); http.get('http://127.0.0.1:49152/stats', res => console.log('HTTP Status:', res.statusCode)).on('error', e => console.log('Offline:', e.message));"
```

### 2. 重启服务
```powershell
powershell -Command "Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList 'node.exe C:\Users\33639\AppData\Local\Programs\antigravity\resources\app\dist\contextServer.js'"
```

### 3. 一键重装/恢复
运行插件根目录下的 `install.bat`。
