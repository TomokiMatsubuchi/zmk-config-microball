import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface KeymapLayer {
  name: string;
  displayName: string;
  description: string;
  bindings: string[][];
}

interface KeyLayout {
  row: number;
  col: number;
  key: string;
}

class ZmkKeymapParser {
  private keymapPath: string;
  private layers: KeymapLayer[] = [];

  constructor(keymapPath: string) {
    this.keymapPath = keymapPath;
  }

  /**
   * keymapファイルを解析してレイヤー情報を取得
   */
  public async parseKeymap(): Promise<void> {
    const content = fs.readFileSync(this.keymapPath, 'utf-8');
    console.log('🔧 ファイル全体サイズ:', content.length);
    
    // ファイル全体から直接レイヤーを抽出
    this.extractLayers(content);
    
    console.log(`🔧 解析完了: ${this.layers.length}個のレイヤーが見つかりました`);
    this.layers.forEach((layer, index) => {
      console.log(`  Layer ${index}: ${layer.name} (${layer.displayName}) - ${layer.bindings.length} rows`);
    });
  }

  /**
   * キーマップコンテンツからレイヤーを動的に抽出
   */
  private extractLayers(content: string): void {
    // keymapファイルからレイヤー名を動的に抽出
    const layerNames = this.extractLayerNames(content);
    console.log(`🔧 動的抽出されたレイヤー: ${layerNames.join(', ')}`);
    
    for (const layerName of layerNames) {
      console.log(`🔧 レイヤー検索: ${layerName}`);
      
      // レイヤー名から次のレイヤー名まで、または文末まで抽出
      const layerStartPattern = new RegExp(`\\s*${layerName}\\s*{`, 'g');
      const layerStartMatch = layerStartPattern.exec(content);
      
      if (layerStartMatch) {
        const startPos = layerStartMatch.index;
        
        // 次のレイヤーの開始位置を探す（または文末まで）
        let endPos = content.length;
        for (const nextLayerName of layerNames) {
          if (nextLayerName !== layerName) {
            const nextLayerPattern = new RegExp(`\\s*${nextLayerName}\\s*{`, 'g');
            nextLayerPattern.lastIndex = startPos + layerStartMatch[0].length;
            const nextMatch = nextLayerPattern.exec(content);
            if (nextMatch && nextMatch.index < endPos) {
              endPos = nextMatch.index;
            }
          }
        }
        
        const layerContent = content.substring(startPos, endPos);
        console.log(`🔧 レイヤーコンテンツ取得: ${layerName}, length: ${layerContent.length}`);
        
        // bindingsを抽出
        const bindingsMatch = layerContent.match(/bindings\s*=\s*<([^>]*(?:>[^<]*<[^>]*)*)>/s);
        if (bindingsMatch) {
          const bindingsText = bindingsMatch[1];
          console.log(`🔧 バインディング抽出成功: ${layerName}, length: ${bindingsText.length}`);
          this.processLayer(layerName, bindingsText);
        } else {
          console.log(`⚠️ バインディング抽出失敗: ${layerName}`);
        }
      } else {
        console.log(`⚠️ レイヤー未発見: ${layerName}`);
      }
      
      // 正規表現の状態をリセット
      layerStartPattern.lastIndex = 0;
    }
  }

  /**
   * keymapファイルからレイヤー名を動的に抽出
   */
  private extractLayerNames(content: string): string[] {
    const layerNames: string[] = [];
    
    // keymapブロック全体を探す（ネストした括弧を考慮）
    const keymapStartMatch = content.match(/keymap\s*{/);
    if (!keymapStartMatch) {
      console.log('⚠️ keymapブロックの開始が見つかりません');
      return layerNames;
    }
    
    let startIndex = keymapStartMatch.index! + keymapStartMatch[0].length;
    let braceCount = 1;
    let endIndex = startIndex;
    
    // バランスの取れた括弧を見つけてkeymapブロックの終わりを特定
    while (braceCount > 0 && endIndex < content.length) {
      const char = content[endIndex];
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      endIndex++;
    }
    
    const keymapContent = content.substring(startIndex, endIndex - 1);
    console.log(`🔧 keymapコンテンツ長: ${keymapContent.length}`);
    
    // keymapコンテンツ内でレイヤー名を抽出
    const layerPattern = /\s*(\w+)\s*\{/g;
    let match;
    while ((match = layerPattern.exec(keymapContent)) !== null) {
      const layerName = match[1];
      const layerBlockStartIndex = match.index + match[0].length;
      
      // このレイヤーブロックにbindingsが含まれているかチェック
      let layerBraceCount = 1;
      let layerEndIndex = layerBlockStartIndex;
      
      while (layerBraceCount > 0 && layerEndIndex < keymapContent.length) {
        const char = keymapContent[layerEndIndex];
        if (char === '{') layerBraceCount++;
        if (char === '}') layerBraceCount--;
        layerEndIndex++;
      }
      
      const layerBlock = keymapContent.substring(layerBlockStartIndex, layerEndIndex - 1);
      if (layerBlock.includes('bindings')) {
        layerNames.push(layerName);
        console.log(`🔧 レイヤー発見: ${layerName}`);
      }
    }
    
    return layerNames;
  }

  /**
   * 単一レイヤーを処理
   */
  private processLayer(layerName: string, bindingsText: string): void {
    console.log(`🔧 Processing layer: ${layerName}, bindings length: ${bindingsText.length}`);
    
    // バインディングを解析
    const bindings = this.parseBindings(bindingsText);
    
    // レイヤー名を人間が読みやすい形に変換
    const displayName = this.formatLayerName(layerName);
    
    // バインディング内容から説明を自動生成
    const description = this.generateLayerDescription(layerName, bindings);
    
    this.layers.push({
      name: layerName,
      displayName,
      description,
      bindings
    });
  }

  /**
   * レイヤー名を読みやすい形に変換（動的）
   */
  private formatLayerName(layerName: string): string {
    // 特別なケースのマッピング
    const specialCases: { [key: string]: string } = {
      'default_layer': 'Default',
      'FUNCTION': 'Function',
      'NUM': 'Number',
      'ARROW': 'Arrow',
      'MOUSE': 'Mouse',
      'SCROLL': 'Scroll'
    };
    
    if (specialCases[layerName]) {
      return specialCases[layerName];
    }
    
    // layer_X の場合は番号から推測
    if (layerName.startsWith('layer_')) {
      const layerNum = layerName.replace('layer_', '');
      if (layerNum === '6') {
        return 'Settings';  // layer_6は設定レイヤー
      }
      return `Layer ${layerNum}`;
    }
    
    // それ以外は単語の最初を大文字に
    return layerName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * バインディング内容からレイヤーの説明を自動生成
   */
  private generateLayerDescription(layerName: string, bindings: string[][]): string {
    const allBindings = bindings.flat().join(' ').toLowerCase();
    
    console.log(`🔧 レイヤー ${layerName} のバインディング解析: ${allBindings.substring(0, 100)}...`);
    
    // default_layerは特別扱い
    if (layerName === 'default_layer') {
      return 'メイン入力レイヤー';
    }
    
    // 特定のキーパターンで説明を自動判定
    if (allBindings.includes('f1') || allBindings.includes('f2') || allBindings.includes('f3') || allBindings.includes('f4')) {
      return 'ファンクションキー（F1-F12）';
    }
    
    if (allBindings.includes('bt_sel') || allBindings.includes('bt_clr') || allBindings.includes('bootloader')) {
      return 'Bluetooth設定・システム';
    }
    
    if (allBindings.includes('up_arrow') || allBindings.includes('down_arrow') || allBindings.includes('left_arrow') || allBindings.includes('right_arrow')) {
      return '矢印キー・ナビゲーション';
    }
    
    if (allBindings.includes('mkp') || allBindings.includes('m_lclick') || allBindings.includes('m_rclick')) {
      return 'マウス操作';
    }
    
    if (allBindings.includes('kp_number') || allBindings.includes('k0') || allBindings.includes('k1') || allBindings.includes('k2')) {
      return '数字・記号入力';
    }
    
    // レイヤー名での判定
    if (layerName.toLowerCase().includes('scroll')) {
      return 'スクロール操作';
    }
    
    // その他の場合は基本的な説明
    return `${this.formatLayerName(layerName)}レイヤー`;
  }

  /**
   * バインディングテキストを解析して2次元配列に変換
   */
  private parseBindings(bindingsText: string): string[][] {
    // コメントを除去
    const cleanText = bindingsText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    
    // バインディングを正規表現で抽出（&で始まる完全なバインディング）
    const bindingRegex = /&\w+(?:\s+[^&\s]+)*|[^&\s]+/g;
    const bindings = cleanText.match(bindingRegex) || [];
    
    // 余分な空白を除去
    const cleanedBindings = bindings
      .map(binding => binding.trim())
      .filter(binding => binding !== '');

    console.log(`🔧 Raw bindings count: ${cleanedBindings.length}`, cleanedBindings.slice(0, 10));

    // microballのレイアウトに合わせて配置
    // 構造: 4行 × 10キー（左5 + 右5） + 4つのサムキー
    const layout: string[][] = [];
    let bindingIndex = 0;

    // 1-3行目: 各行10キー（左5 + 右5）
    for (let row = 0; row < 3; row++) {
      const rowBindings: string[] = [];
      for (let col = 0; col < 10; col++) {
        if (bindingIndex < cleanedBindings.length) {
          rowBindings.push(this.formatKey(cleanedBindings[bindingIndex++]));
        } else {
          rowBindings.push('---');
        }
      }
      layout.push(rowBindings);
      console.log(`🔧 Row ${row + 1}: ${rowBindings.join(', ')}`);
    }

    // 4行目: 親指キー（最大10個程度に制限）
    if (bindingIndex < cleanedBindings.length) {
      const thumbRow: string[] = [];
      let thumbKeyCount = 0;
      const maxThumbKeys = 10; // 親指キー数の上限
      
      while (bindingIndex < cleanedBindings.length && thumbKeyCount < maxThumbKeys) {
        thumbRow.push(this.formatKey(cleanedBindings[bindingIndex++]));
        thumbKeyCount++;
      }
      
      if (thumbRow.length > 0) {
        layout.push(thumbRow);
        console.log(`🔧 Thumb row: ${thumbRow.join(', ')}`);
      }
      
      // 残りのキーがあれば警告
      if (bindingIndex < cleanedBindings.length) {
        console.warn(`⚠️ Remaining keys ignored: ${cleanedBindings.length - bindingIndex} keys`);
      }
    }

    return layout;
  }

  /**
   * キーバインディングを詳細情報付きで人間が読みやすい形に変換
   */
  private formatKey(binding: string): string {
    if (!binding || binding.trim() === '') return '---';
    
    const originalBinding = binding;
    // & プレフィックスを除去
    binding = binding.replace(/^&/, '');
    
    // 透過キー
    if (binding === 'trans') return '▽';
    
    // 複雑なバインディングの処理（詳細情報を保持）
    if (binding.startsWith('lt')) {
      // レイヤータップ: &lt 5 P -> "LT5(P)"
      const match = binding.match(/lt\s+(\d+)\s+(.+)/);
      if (match) {
        const layer = match[1];
        const key = this.formatKeyCode(match[2].trim());
        return `LT${layer}(${key})`;
      }
    }
    
    if (binding.startsWith('mt')) {
      // モディファイアタップ: &mt LEFT_SHIFT Z -> "MT(LSft,Z)"
      const match = binding.match(/mt\s+(\S+)\s+(.+)/);
      if (match) {
        const mod = this.formatModifier(match[1]);
        const key = this.formatKeyCode(match[2].trim());
        return `MT(${mod},${key})`;
      }
    }
    
    if (binding.startsWith('kp')) {
      // キープレス: &kp LS(LG(S)) -> "⇧⌘S"
      const match = binding.match(/kp\s+(.+)/);
      if (match) {
        return this.formatKeyCode(match[1].trim());
      }
    }
    
    if (binding.startsWith('to')) {
      // レイヤー移動: &to 0 -> "TO(0)"
      const match = binding.match(/to\s+(\d+)/);
      if (match) {
        return `TO(${match[1]})`;
      }
    }
    
    if (binding.startsWith('mo')) {
      // モメンタリー: &mo 1 -> "MO(1)"
      const match = binding.match(/mo\s+(\d+)/);
      if (match) {
        return `MO(${match[1]})`;
      }
    }
    
    // Bluetoothコマンド
    if (binding.includes('bt')) {
      if (binding.includes('BT_SEL')) {
        const match = binding.match(/BT_SEL\s+(\d+)/);
        if (match) return `BT_SEL(${match[1]})`;
      }
      if (binding.includes('BT_CLR_ALL')) return 'BT_CLR_ALL';
      if (binding.includes('BT_CLR')) return 'BT_CLR';
    }
    
    // マウスクリック
    if (binding.includes('mkp')) {
      if (binding.includes('MB1')) return 'M_LClick';
      if (binding.includes('MB2')) return 'M_RClick';
      if (binding.includes('MB3')) return 'M_MClick';
    }
    
    // センサーバインディング
    if (binding.includes('inc_dec_kp')) {
      const match = binding.match(/inc_dec_kp\s+(.+)\s+(.+)/);
      if (match) {
        const key1 = this.formatKeyCode(match[1]);
        const key2 = this.formatKeyCode(match[2]);
        return `SCROLL(${key1}/${key2})`;
      }
    }
    
    // 特殊なバインディング
    if (binding.includes('bootloader')) return 'BOOTLOADER';
    if (binding.includes('reset')) return 'RESET';
    
    // カスタムマクロ・behaviors
    if (binding.startsWith('to_layer_0')) {
      const match = binding.match(/to_layer_0\s+(.+)/);
      if (match) {
        const key = this.formatKeyCode(match[1]);
        return `TO0(${key})`;
      }
    }
    
    if (binding.startsWith('lt_to_layer_0')) {
      const match = binding.match(/lt_to_layer_0\s+(\d+)\s+(.+)/);
      if (match) {
        const layer = match[1];
        const key = this.formatKeyCode(match[2]);
        return `LT_TO0(${layer},${key})`;
      }
    }
    
    // 元の文字列をそのまま返す（分からないものはそのまま表示）
    return originalBinding;
  }

  /**
   * キーコードを詳細に変換（修飾キー付きも対応）
   */
  private formatKeyCode(keyCode: string): string {
    if (!keyCode) return '';
    
    // 複雑な修飾キー付きの処理: LS(LG(S)) -> "⇧⌘S"
    let result = keyCode;
    
    // 修飾キー記号への変換（正規表現の特殊文字をエスケープ）
    const modifierSymbols: { [key: string]: string } = {
      'LS(': '⇧', 'RS(': '⇧',
      'LC(': '⌃', 'RC(': '⌃', 
      'LA(': '⌥', 'RA(': '⌥',
      'LG(': '⌘', 'RG(': '⌘'
    };
    
    // 修飾キーを記号に変換（文字列置換を使用）
    for (const [mod, symbol] of Object.entries(modifierSymbols)) {
      result = result.replace(new RegExp(mod.replace(/[()]/g, '\\$&'), 'g'), symbol);
    }
    
    // 閉じかっこを除去
    result = result.replace(/\)/g, '');
    
    // 基本キーコードのマッピング
    const keyMappings: { [key: string]: string } = {
      'LEFT_SHIFT': '⇧', 'RIGHT_SHIFT': '⇧', 'LSHIFT': '⇧', 'RSHIFT': '⇧',
      'LEFT_CTRL': '⌃', 'RIGHT_CTRL': '⌃', 'LCTRL': '⌃', 'RCTRL': '⌃',
      'LEFT_ALT': '⌥', 'RIGHT_ALT': '⌥', 'LALT': '⌥', 'RALT': '⌥',
      'LEFT_WIN': '⌘', 'RIGHT_WIN': '⌘', 'LGUI': '⌘', 'RGUI': '⌘',
      'LEFT_GUI': '⌘', 'RIGHT_GUI': '⌘',
      
      'SPACE': 'Space', 'ENTER': 'Enter', 'BACKSPACE': 'Bksp', 'DELETE': 'Del',
      'TAB': 'Tab', 'ESCAPE': 'Esc', 'ESC': 'Esc',
      
      'UP_ARROW': '↑', 'DOWN_ARROW': '↓', 'LEFT_ARROW': '←', 'RIGHT_ARROW': '→',
      'PAGE_UP': 'PgUp', 'PAGE_DOWN': 'PgDn', 'HOME': 'Home', 'END': 'End',
      
      'NUMBER_1': '1', 'NUMBER_2': '2', 'NUMBER_3': '3', 'NUMBER_4': '4',
      'NUMBER_5': '5', 'NUMBER_6': '6', 'NUMBER_7': '7', 'NUMBER_8': '8',
      'NUMBER_9': '9', 'NUMBER_0': '0',
      'KP_NUMBER_1': 'K1', 'KP_NUMBER_2': 'K2', 'KP_NUMBER_3': 'K3', 'KP_NUMBER_4': 'K4',
      'KP_NUMBER_5': 'K5', 'KP_NUMBER_6': 'K6', 'KP_NUMBER_7': 'K7', 'KP_NUMBER_8': 'K8',
      'KP_NUMBER_9': 'K9', 'KP_NUMBER_0': 'K0',
      
      'MINUS': '-', 'EQUAL': '=', 'PLUS': '+', 'ASTERISK': '*', 'SLASH': '/',
      'SEMICOLON': ';', 'COLON': ':', 'SINGLE_QUOTE': "'", 'DOUBLE_QUOTES': '"',
      'LEFT_BRACKET': '[', 'RIGHT_BRACKET': ']', 'LEFT_BRACE': '{', 'RIGHT_BRACE': '}',
      'LEFT_PARENTHESIS': '(', 'RIGHT_PARENTHESIS': ')', 'BACKSLASH': '\\', 'PIPE': '|',
      'COMMA': ',', 'PERIOD': '.', 'DOT': '.', 'UNDERSCORE': '_',
      'EXCLAMATION': '!', 'AT_SIGN': '@', 'HASH': '#', 'DOLLAR': '$', 'PERCENT': '%',
      'CARET': '^', 'AMPERSAND': '&', 'TILDE': '~',
      
      'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
      'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12', 'F13': 'F13',
      
      'LANG1': 'Kana', 'LANG2': 'Eisu', 'INT_MUHENKAN': '無変換'
    };
    
    return keyMappings[result] || result;
  }

  /**
   * 修飾キーを短縮形に変換
   */
  private formatModifier(modifier: string): string {
    const modMappings: { [key: string]: string } = {
      'LEFT_SHIFT': 'LSft', 'RIGHT_SHIFT': 'RSft', 'LSHIFT': 'LSft', 'RSHIFT': 'RSft',
      'LEFT_CTRL': 'LCtl', 'RIGHT_CTRL': 'RCtl', 'LCTRL': 'LCtl', 'RCTRL': 'RCtl',
      'LEFT_ALT': 'LAlt', 'RIGHT_ALT': 'RAlt', 'LALT': 'LAlt', 'RALT': 'RAlt',
      'LEFT_WIN': 'LCmd', 'RIGHT_WIN': 'RCmd', 'LGUI': 'LCmd', 'RGUI': 'RCmd',
      'LEFT_GUI': 'LCmd', 'RIGHT_GUI': 'RCmd'
    };
    
    return modMappings[modifier] || modifier;
  }

  /**
   * README.mdのキーマップセクションを生成（ASCIIアート形式）
   */
  public generateReadmeKeymap(): string {
    let readme = '# Microball ZMK キーマップ\n\n';
    readme += 'このリポジトリはmicroball分割キーボード用のZMKキーマップ設定です。\n\n';
    readme += '## キーマップエディター\n\n';
    readme += '以下のリンクからキーマップを視覚的に編集できます：\n';
    readme += 'https://nickcoutsos.github.io/keymap-editor/\n\n';
    readme += '## PDFダウンロード\n\n';
    readme += '📄 [最新のキーマップPDFをダウンロード](../../actions/workflows/update-readme.yml) \n';
    readme += '（GitHub ActionsのArtifactsから `keymap-pdf` をダウンロードしてください）\n\n';
    readme += '## 現在のキーマップ\n\n';
    readme += '### レイヤー一覧\n\n';
    readme += '| レイヤー | 説明 |\n';
    readme += '|----------|------|\n';
    
    // レイヤー一覧を動的に生成
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      readme += `| ${layer.displayName} (Layer ${i}) | ${layer.description} |\n`;
    }
    
    readme += '\n---\n\n';
    
    // 各レイヤーをASCIIアート形式で表示
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      readme += `### ${layer.displayName} (Layer ${i})\n\n`;
      readme += `*${layer.description}*\n\n`;
      readme += this.generateASCIILayout(layer.bindings);
      readme += '\n';
    }
    
    readme += '\n---\n\n';
    readme += '## セットアップ\n\n';
    readme += '1. このリポジトリをフォーク\n';
    readme += '2. [keymap-editor](https://nickcoutsos.github.io/keymap-editor/)でリポジトリを読み込み\n';
    readme += '3. キーマップを編集\n';
    readme += '4. 変更をコミット\n\n';
    readme += '## ビルド\n\n';
    readme += 'GitHub Actionsが自動的にファームウェアをビルドします。\n';
    readme += 'Artifactsからufアイルをダウンロードして使用してください。\n\n';
    readme += `*最終更新: ${new Date().toLocaleDateString('ja-JP')}*\n\n`;
    
    return readme;
  }

  /**
   * 詳細バインディング情報を生成
   */
  private generateDetailedBindings(bindings: string[][]): string {
    let details = '';
    
    for (let rowIndex = 0; rowIndex < bindings.length; rowIndex++) {
      const row = bindings[rowIndex];
      const rowName = rowIndex < 3 ? `Row ${rowIndex + 1}` : 'Thumb Keys';
      
      details += `**${rowName}:**\n\n`;
      
      if (rowIndex < 3) {
        // 通常行: 左右5つずつ
        const leftSide = row.slice(0, 5);
        const rightSide = row.slice(5, 10);
        
        details += '*Left Side:* ';
        details += leftSide.map((key, idx) => `[${idx}] \`${key}\``).join(', ');
        details += '\n\n';
        
        details += '*Right Side:* ';
        details += rightSide.map((key, idx) => `[${idx + 5}] \`${key}\``).join(', ');
        details += '\n\n';
      } else {
        // 親指キー行: 順番に表示
        details += row.map((key, idx) => `[${idx}] \`${key}\``).join(', ');
        details += '\n\n';
      }
    }
    
    return details;
  }

  /**
   * レイヤーのキー配置をテーブル形式で生成
   */
  private generateLayerTable(bindings: string[][]): string {
    if (bindings.length === 0) return '';

    let table = '';
    
    // 上段3行（左右分割）
    for (let rowIndex = 0; rowIndex < Math.min(3, bindings.length); rowIndex++) {
      const row = bindings[rowIndex];
      const leftHalf = row.slice(0, 5);
      const rightHalf = row.slice(5, 10);
      
      // 左側
      table += '| ' + leftHalf.map(key => `${key}`).join(' | ') + ' |';
      table += '     ';  // 中央の空白（視覚的な分離）
      // 右側
      table += '| ' + rightHalf.map(key => `${key}`).join(' | ') + ' |\n';
      
      // ヘッダー行の場合はセパレータを追加
      if (rowIndex === 0) {
        table += '|' + Array(5).fill('---').join('|') + '|';
        table += '     ';
        table += '|' + Array(5).fill('---').join('|') + '|\n';
      }
    }
    
    // 親指キー行
    if (bindings.length > 3) {
      table += '\n**親指キー:**\n\n';
      const thumbRow = bindings[3];
      table += '| ' + thumbRow.map(key => `${key}`).join(' | ') + ' |\n';
      table += '|' + Array(thumbRow.length).fill('---').join('|') + '|\n';
    }
    
    return table;
  }

  /**
   * 既存のREADME.mdを更新
   */
  public async updateReadme(): Promise<void> {
    const readmePath = path.join(path.dirname(this.keymapPath), '..', 'README.md');
    const keymapSection = this.generateReadmeKeymap();
    
    let readmeContent = '';
    
    // キーマップセクションマーカー
    const keymapStartMarker = '<!-- KEYMAP_START -->';
    const keymapEndMarker = '<!-- KEYMAP_END -->';
    
    // 既存のREADME.mdがある場合は読み込み
    if (fs.existsSync(readmePath)) {
      readmeContent = fs.readFileSync(readmePath, 'utf-8');
      
      // キーマップセクションがあれば置換、なければ追加
      const startIndex = readmeContent.indexOf(keymapStartMarker);
      const endIndex = readmeContent.indexOf(keymapEndMarker);
      
      if (startIndex !== -1 && endIndex !== -1) {
        // 既存のキーマップセクションを置換
        readmeContent = readmeContent.substring(0, startIndex) +
          keymapStartMarker + '\n\n' + keymapSection + '\n' + keymapEndMarker +
          readmeContent.substring(endIndex + keymapEndMarker.length);
      } else {
        // キーマップセクションを追加
        readmeContent += '\n\n' + keymapStartMarker + '\n\n' + keymapSection + '\n' + keymapEndMarker + '\n';
      }
    } else {
      // 新しいREADME.mdを作成
      readmeContent = keymapStartMarker + '\n\n' + keymapSection + '\n' + keymapEndMarker + '\n';
    }
    
    fs.writeFileSync(readmePath, readmeContent);
    console.log(`✅ README.md が正常に更新されました: ${readmePath}`);
  }

  /**
   * キーマップPDFを生成（PDFKit使用）
   */
  public async generatePDF(): Promise<void> {
    const pdfPath = path.join(path.dirname(this.keymapPath), '..', 'keymap.pdf');
    
    try {
      // PDFDocumentを作成
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      
      // ファイルストリームを作成
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      
      // タイトル
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#2563eb')
         .text('Microball ZMK Keymap', { align: 'center' });
      
      doc.moveDown(0.5);
      
      // 更新日
      doc.fontSize(10)
         .fillColor('#6b7280')
         .text(`Generated: ${new Date().toLocaleDateString('ja-JP')}`, { align: 'center' });
      
      doc.moveDown(1);
      
      // 各レイヤーを描画
      for (let i = 0; i < this.layers.length; i++) {
        const layer = this.layers[i];
        
        console.log(`🔧 Processing layer ${i}: ${layer.displayName}`);
        console.log(`🔧 Layer bindings:`, layer.bindings);
        
        // データの検証
        if (!Array.isArray(layer.bindings)) {
          console.error(`❌ Layer ${i} bindings is not an array:`, layer.bindings);
          continue;
        }
        
        // 新しいページが必要かチェック（最初のレイヤー以外）
        if (i > 0 && doc.y > 650) {
          doc.addPage();
        }
        
        // レイヤータイトル
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#1f2937')
           .text(`Layer ${i}: ${layer.displayName}`, { underline: true });
        
        doc.moveDown(0.5);
        
        // キーマップを描画
        this.drawKeyboardLayout(doc, layer.bindings);
        
        doc.moveDown(1);
      }
      
      // 凡例を追加
      this.drawLegend(doc);
      
      // PDFを完了
      doc.end();
      
      // ストリームの完了を待機
      return new Promise((resolve, reject) => {
        stream.on('finish', () => {
          console.log(`✅ PDF が正常に生成されました: ${pdfPath}`);
          resolve();
        });
        stream.on('error', reject);
      });
      
    } catch (error) {
      console.error('❌ PDF生成でエラーが発生しました:', error);
      throw error;
    }
  }

  /**
   * キーマップ用のHTMLを生成
   */
  /**
   * キーボードレイアウトをPDFに描画
   */
  private drawKeyboardLayout(doc: any, bindings: string[][]): void {
    const startX = 80;
    // doc.yの値を確実に数値にする
    const currentY = typeof doc.y === 'number' && !isNaN(doc.y) ? doc.y : 150;
    const startY = Math.max(currentY, 100); // 最小値を100に設定
    const keyWidth = 40;
    const keyHeight = 30;
    const keySpacing = 5;
    const rowSpacing = 8;
    
    console.log(`🔧 PDF描画開始 - startY: ${startY}, bindings.length: ${bindings.length}`);
    
    // 上段3行を描画（左右分割）
    for (let rowIndex = 0; rowIndex < Math.min(3, bindings.length); rowIndex++) {
      const row = bindings[rowIndex];
      if (!Array.isArray(row)) {
        console.warn(`⚠️ Row ${rowIndex} is not an array:`, row);
        continue;
      }
      
      const y = startY + rowIndex * (keyHeight + rowSpacing);
      console.log(`🔧 Row ${rowIndex} - y: ${y}, row.length: ${row.length}`);
      
      // 左半分（0-4）
      for (let col = 0; col < 5 && col < row.length; col++) {
        const x = startX + col * (keyWidth + keySpacing);
        console.log(`🔧 Left key [${rowIndex}][${col}] - x: ${x}, y: ${y}, key: ${row[col]}`);
        this.drawKey(doc, x, y, keyWidth, keyHeight, row[col] || '');
      }
      
      // 中央のスペース
      const centerX = startX + 5 * (keyWidth + keySpacing) + 30;
      
      // 右半分（5-9）
      for (let col = 5; col < 10 && col < row.length; col++) {
        const x = centerX + (col - 5) * (keyWidth + keySpacing);
        console.log(`🔧 Right key [${rowIndex}][${col}] - x: ${x}, y: ${y}, key: ${row[col]}`);
        this.drawKey(doc, x, y, keyWidth, keyHeight, row[col] || '');
      }
    }
    
    // 親指キー行がある場合
    if (bindings.length > 3 && Array.isArray(bindings[3])) {
      const thumbRow = bindings[3];
      const thumbY = startY + 3 * (keyHeight + rowSpacing) + 15;
      
      // 親指キー用の設定
      const thumbKeyWidth = keyWidth * 0.9;
      const thumbKeyHeight = keyHeight * 0.9;
      const thumbSpacing = keySpacing + 2;
      
      console.log(`🔧 Thumb row - thumbY: ${thumbY}, thumbRow.length: ${thumbRow.length}`);
      
      // 親指キーは最大10個まで、2列に分けて配置
      const maxThumbKeys = Math.min(10, thumbRow.length);
      const keysPerSide = Math.ceil(maxThumbKeys / 2);
      
      for (let i = 0; i < maxThumbKeys; i++) {
        let x, y;
        
        if (i < keysPerSide) {
          // 左側の親指キー
          x = startX + 40 + i * (thumbKeyWidth + thumbSpacing);
          y = thumbY;
        } else {
          // 右側の親指キー
          x = startX + 250 + (i - keysPerSide) * (thumbKeyWidth + thumbSpacing);
          y = thumbY;
        }
        
        console.log(`🔧 Thumb key ${i} - x: ${x}, y: ${y}, key: ${thumbRow[i]}`);
        this.drawKey(doc, x, y, thumbKeyWidth, thumbKeyHeight, thumbRow[i] || '');
      }
    }
    
    // 次のコンテンツ用にy位置を更新
    const nextY = startY + 4 * (keyHeight + rowSpacing) + 50;
    doc.y = nextY;
    console.log(`🔧 PDF描画完了 - nextY: ${nextY}`);
  }

  /**
   * 個別のキーをPDFに描画
   */
  private drawKey(doc: any, x: number, y: number, width: number, height: number, keyLabel: string): void {
    // 値の検証とデフォルト値の設定
    const safeX = typeof x === 'number' && !isNaN(x) ? x : 0;
    const safeY = typeof y === 'number' && !isNaN(y) ? y : 0;
    const safeWidth = typeof width === 'number' && !isNaN(width) && width > 0 ? width : 40;
    const safeHeight = typeof height === 'number' && !isNaN(height) && height > 0 ? height : 30;
    const safeLabel = typeof keyLabel === 'string' ? keyLabel : '';
    
    if (x !== safeX || y !== safeY || width !== safeWidth || height !== safeHeight) {
      console.warn(`⚠️ Invalid coordinates fixed for key "${safeLabel}":`, 
        `x: ${x} -> ${safeX}, y: ${y} -> ${safeY}, w: ${width} -> ${safeWidth}, h: ${height} -> ${safeHeight}`);
    }
    
    try {
      // キーの背景
      doc.rect(safeX, safeY, safeWidth, safeHeight)
         .fillAndStroke('#f8fafc', '#e2e8f0');
      
      // キーのテキスト
      const fontSize = safeLabel.length > 6 ? 6 : safeLabel.length > 4 ? 7 : 8;
      const textX = safeX + 2;
      const textY = safeY + Math.floor(safeHeight / 2) - Math.floor(fontSize / 2);
      
      doc.fontSize(fontSize)
         .fillColor('#1f2937')
         .text(safeLabel, textX, textY, {
           width: safeWidth - 4,
           align: 'center'
         });
    } catch (error) {
      console.error(`❌ Error drawing key "${safeLabel}":`, error);
    }
  }

  /**
   * 凡例をPDFに描画
   */
  private drawLegend(doc: any): void {
    // 新しいページに移動（必要に応じて）
    if (doc.y > 650) {
      doc.addPage();
    }
    
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#1f2937')
       .text('凡例 (Legend)', { underline: true });
    
    doc.moveDown(0.5);
    
    const legends = [
      '▽: 透過（下位レイヤーのキー）',
      'L# Key: レイヤータップ（ホールドでレイヤー#、タップでKey）',
      'Mod Key: モディファイアタップ（ホールドでModifier、タップでKey）',
      'To #: レイヤー#に移動',
      'Mo #: レイヤー#を一時的に有効化',
      'BT #: Bluetooth デバイス#に接続',
      'BT Clr/ClrAll: Bluetooth 接続をクリア'
    ];
    
    doc.fontSize(9)
       .fillColor('#374151');
    
    legends.forEach(legend => {
      doc.text(`• ${legend}`);
      doc.moveDown(0.3);
    });
  }

  /**
   * ASCIIアート形式でキーボードレイアウトを生成
   */
  private generateASCIILayout(bindings: string[][]): string {
    if (bindings.length === 0) return '';

    let layout = '\n```\n';
    
    // 上段3行の処理
    for (let rowIndex = 0; rowIndex < Math.min(3, bindings.length); rowIndex++) {
      const row = bindings[rowIndex];
      const leftHalf = row.slice(0, 5);
      const rightHalf = row.slice(5, 10);
      
      // 上のボーダー（最初の行のみ）
      if (rowIndex === 0) {
        layout += '┌───────┬───────┬───────┬───────┬───────┐               ┌───────┬───────┬───────┬───────┬───────┐\n';
      }
      
      // キーの内容
      layout += '│';
      for (const key of leftHalf) {
        const paddedKey = this.padKey(key);
        layout += ` ${paddedKey.padEnd(5)} │`;
      }
      layout += '               │';
      for (const key of rightHalf) {
        const paddedKey = this.padKey(key);
        layout += ` ${paddedKey.padEnd(5)} │`;
      }
      layout += '\n';
      
      // 中間のボーダー
      if (rowIndex < 2) {
        layout += '├───────┼───────┼───────┼───────┼───────┼───────┐     ┌───────┼───────┼───────┼───────┼───────┼───────┤\n';
      } else {
        layout += '├───────┼───────┼───────┼───────┼───────┼───────┤     ├───────┼───────┼───────┼───────┼───────┼───────┤\n';
      }
    }
    
    // 親指キー行
    if (bindings.length > 3) {
      const thumbRow = bindings[3];
      const leftThumb = thumbRow.slice(0, 5);
      const rightThumb = thumbRow.slice(5, 10);
      
      layout += '└───────┼───────┼───────┼───────┼───────┼───────┤     ├───────┼───────┼───────┼───────┼───────┼───────┘\n';
      layout += '        │';
      for (const key of leftThumb) {
        const paddedKey = this.padKey(key);
        layout += ` ${paddedKey.padEnd(5)} │`;
      }
      layout += '     │';
      for (const key of rightThumb) {
        const paddedKey = this.padKey(key);
        layout += ` ${paddedKey.padEnd(5)} │`;
      }
      layout += '\n';
      layout += '        └───────┴───────┴───────┴───────┴───────┘     └───────┴───────┴───────┴───────┘\n';
    } else {
      layout += '└───────┴───────┴───────┴───────┴───────┘               └───────┴───────┴───────┴───────┴───────┘\n';
    }
    
    layout += '```\n';
    return layout;
  }

  /**
   * キー名を固定幅にパディング（可読性重視の短縮ルール）
   */
  private padKey(key: string): string {
    // 透過キーの表示
    if (key === '▽') return ' ▽ ';
    
    // 5文字以内はそのまま
    if (key.length <= 5) {
      return key;
    }
    
    // 6-8文字は少し短縮
    if (key.length <= 8) {
      return key;
    }
    
    // 特定のパターンに応じて短縮
    if (key.startsWith('BT_SEL(')) {
      return key.replace('BT_SEL', 'BT'); // BT_SEL(0) -> BT(0)
    }
    if (key.startsWith('M_LClick')) {
      return 'L-Click';
    }
    if (key.startsWith('M_MClick')) {
      return 'M-Click';
    }
    if (key.startsWith('M_RClick')) {
      return 'R-Click';
    }
    if (key.startsWith('BOOTLOADER')) {
      return 'BOOT';
    }
    if (key.startsWith('BT_CLR')) {
      return 'BT CLR';
    }
    if (key.includes('NUMBER_0')) {
      return key.replace('KP_NUMBER_0', 'K0');
    }
    if (key.includes('LEFT_ARROW')) {
      return key.replace('LEFT_ARROW', '←');
    }
    if (key.includes('RIGHT_ARROW')) {
      return key.replace('RIGHT_ARROW', '→');
    }
    
    // 10文字以上は省略
    if (key.length >= 10) {
      return key.substring(0, 7) + '..';
    }
    
    return key;
  }
}

// メイン処理
async function main() {
  try {
    console.log('🔧 __dirname:', __dirname);
    const keymapPath = path.resolve(__dirname, '..', '..', '..', 'config', 'microball.keymap');
    console.log('🔍 キーマップファイルパス:', keymapPath);
    
    const parser = new ZmkKeymapParser(keymapPath);
    
    console.log('🔍 キーマップファイルを解析中...');
    await parser.parseKeymap();
    
    console.log('📝 README.md を更新中...');
    await parser.updateReadme();
    
    console.log('📄 PDF を生成中...');
    await parser.generatePDF();
    
    console.log('🎉 処理が完了しました！');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみmain関数を呼び出し
main();
