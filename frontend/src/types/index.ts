// 分析结果类型
export interface AnalysisResult {
  id: string;
  geogebra: string;        // GeoGebra 命令脚本（多行）
  conditions: string[];    // 已知条件
  goal: string;            // 求解目标
  solution: string[];      // 解题步骤
  createdAt: string;       // ISO 时间
}

// 图形生成结果类型
export interface GraphicResult {
  id: string;
  geogebra: string;        // GeoGebra 命令脚本
  format: 'svg' | 'png';
  content?: string;        // SVG 内容或 Base64 PNG
  createdAt: string;
}

// API 响应通用包装
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// 分析接口请求
export interface AnalyzeRequest {
  image: string;           // Base64 data URI
}

// 图形生成接口请求
export interface GenerateGraphicRequest {
  text: string;            // 题目文本
  sketch?: string;         // 手绘草图 Base64 data URI（可选）
}

// GeoGebra Applet 参数
export interface GeoGebraParams {
  appName?: string;
  width?: number;
  height?: number;
  showToolBar?: boolean;
  showAlgebraInput?: boolean;
  showMenuBar?: boolean;
  enableLabelDrags?: boolean;
  enableShiftDragZoom?: boolean;
  showResetIcon?: boolean;
  language?: string;
  id?: string;
  showErrorDialogs?: boolean;
  appletOnLoad?: () => void;
}

// window.GGBApplet 声明
declare global {
  interface Window {
    GGBApplet: new (params: GeoGebraParams & { [key: string]: unknown }, html5only: boolean) => {
      inject: (element: HTMLElement | string) => void;
    };
    ggbApplet?: GgbAppletAPI;
  }
}

/** GeoGebra Applet 实例 API（Issue #11：补全常用方法） */
export interface GgbAppletAPI {
  // 命令执行
  evalCommand: (cmd: string) => boolean;
  reset: () => void;
  newConstruction: () => void;
  // 导出
  exportSVG: () => string;
  getPNGBase64: (dpi?: number) => string;
  // 对象管理
  getAllObjectNames: (type?: string) => string[];
  getObjectType: (objName: string) => string;
  deleteObject: (objName: string) => void;
  // 坐标与值
  getValue: (objName: string) => number;
  setValue: (objName: string, value: number) => void;
  getXcoord: (objName: string) => number;
  getYcoord: (objName: string) => number;
  setCoords: (objName: string, x: number, y: number) => void;
  // 显示与样式
  setVisible: (objName: string, visible: boolean) => void;
  isVisible: (objName: string) => boolean;
  setColor: (objName: string, red: number, green: number, blue: number) => void;
  setLabelVisible: (objName: string, visible: boolean) => void;
}

// 动画状态
export type AnimationState = 'idle' | 'playing' | 'paused' | 'finished';

// 上传模式
export type UploadMode = 'analyze' | 'generate';
