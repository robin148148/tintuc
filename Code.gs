/**
 * =========================================================================================
 * DỰ ÁN: CỔNG TIN TỨC ĐIỆN TỬ TỰ HÀNH (NEWS PORTAL AUTOMATION)
 * BACKEND: GOOGLE APPS SCRIPT (Code.gs)
 * =========================================================================================
 * 
 * Mô tả:
 * - Tự động cào tin từ các nguồn RSS báo chí chính thống uy tín của Việt Nam & Quốc tế.
 * - Phân loại thông minh vào 6 chuyên mục trọng tâm (Thiên tai, Thời tiết cực đoan,
 *   Tai nạn, Chính trị, Công nghệ AI, Thủ thuật IT).
 * - Làm sạch HTML, trích xuất ảnh thumbnail, định dạng TL;DR tóm tắt 2-3 câu.
 * - Tự động chạy ngầm hàng ngày vào lúc 07:00 sáng (Giờ Hà Nội - GMT+7).
 * - Ghi dữ liệu đồng bộ vào Google Sheet để làm Database cấp API cho Frontend (index.html).
 * 
 * Tác giả: Antigravity Autonomous News Pipeline
 * Phiên bản: 2.0 (Ổn định, chống chặn CORS, chuẩn hóa dữ liệu tự động)
 * =========================================================================================
 */

// ==========================================
// 1. CẤU HÌNH HỆ THỐNG (SYSTEM CONFIGURATION)
// ==========================================
var CONFIG = {
  // ID Bảng tính Google Sheet (Đảm bảo tự động chạy ngầm chính xác 100% kể cả khi là Standalone Script trên script.google.com)
  SPREADSHEET_ID: "11mhGrhrTpLMUeFV6YHG3XIz-sraC6jVFbXpc48AIUGY",

  // Tên Sheet lưu trữ dữ liệu tin tức
  SHEET_NAME: "TinTuc",
  
  // Múi giờ chuẩn Hà Nội
  TIMEZONE: "Asia/Ho_Chi_Minh",
  
  // Giới hạn số lượng tin tối đa lưu trữ trên Sheet (tránh đầy bảng tính)
  MAX_ARTICLES: 100,

  // Chế độ ghi: 'REFRESH_DAILY' (Xóa và cập nhật mới mỗi sáng) hoặc 'APPEND_UNIQUE' (Ghi nối thêm)
  WRITE_MODE: "REFRESH_DAILY",

  // Tiêu đề 9 cột dữ liệu chuẩn mực
  HEADERS: [
    "STT",
    "Thời gian xuất bản",
    "Chuyên mục",
    "Tiêu đề bài báo",
    "Tóm tắt nhanh (TL;DR 2-3 câu)",
    "Nguồn báo chí",
    "Link bài viết gốc",
    "Ảnh thumbnail",
    "Mức độ nổi bật"
  ],

  // Ảnh đại diện dự phòng chất lượng cao (Unsplash CDN) theo từng chuyên mục khi bài viết không có ảnh
  FALLBACK_IMAGES: {
    "Thiên tai": "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=1200&q=80",
    "Thời tiết cực đoan": "https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=1200&q=80",
    "Tai nạn": "https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=1200&q=80",
    "Chính trị": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1200&q=80",
    "Công nghệ AI": "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80",
    "Thủ thuật IT": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80"
  }
};

// ==========================================
// 2. DANH SÁCH NGUỒN RSS BÁO CHÍ CHÍNH THỐNG
// ==========================================

/**
 * Hàm lấy đối tượng Spreadsheet an toàn (hỗ trợ cả Container-bound Script và Standalone Script)
 */
function layBangTinh() {
  try {
    var ss = layBangTinh();
    if (ss) return ss;
  } catch (e) {}
  if (CONFIG.SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (err) {
      throw new Error("Không thể mở bảng tính với ID: " + CONFIG.SPREADSHEET_ID + ". Lỗi: " + err.message);
    }
  }
  throw new Error("Không tìm thấy bảng tính Google Sheet! Vui lòng cấu hình CONFIG.SPREADSHEET_ID.");
}

var RSS_FEEDS = [
  // --- VnExpress (Các chuyên mục cập nhật liên tục 2026) ---
  { name: "VnExpress", url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
  { name: "VnExpress", url: "https://vnexpress.net/rss/thoi-su.rss" },
  { name: "VnExpress", url: "https://vnexpress.net/rss/so-hoa.rss" },
  { name: "VnExpress", url: "https://vnexpress.net/rss/khoa-hoc.rss" },

  // --- Tuổi Trẻ (Đã cập nhật kênh công nghệ chuẩn 2026) ---
  { name: "Tuổi Trẻ", url: "https://tuoitre.vn/rss/tin-moi-nhat.rss" },
  { name: "Tuổi Trẻ", url: "https://tuoitre.vn/rss/thoi-su.rss" },
  { name: "Tuổi Trẻ", url: "https://tuoitre.vn/rss/cong-nghe.rss" },

  // --- Dân Trí (Đã loại bỏ feed cũ, thay bằng chuyên mục thời sự & công nghệ trực tiếp) ---
  { name: "Dân Trí", url: "https://dantri.com.vn/rss/tin-moi-nhat.rss" },
  { name: "Dân Trí", url: "https://dantri.com.vn/rss/thoi-su.rss" },
  { name: "Dân Trí", url: "https://dantri.com.vn/rss/cong-nghe.rss" },

  // --- VietnamNet (Đã loại bỏ các link feed cũ ngưng hoạt động, chỉ giữ feed thời sự & kinh tế mới) ---
  { name: "VietnamNet", url: "https://vietnamnet.vn/rss/thoi-su.rss" },
  { name: "VietnamNet", url: "https://vietnamnet.vn/rss/kinh-doanh.rss" },
  { name: "VietnamNet", url: "https://vietnamnet.vn/rss/the-gioi.rss" },

  // --- Thanh Niên (Trực tiếp thời sự & công nghệ hàng ngày) ---
  { name: "Thanh Niên", url: "https://thanhnien.vn/rss/home.rss" },
  { name: "Thanh Niên", url: "https://thanhnien.vn/rss/thoi-su.rss" },
  { name: "Thanh Niên", url: "https://thanhnien.vn/rss/cong-nghe.rss" }
];

// ==========================================
// 3. BỘ TỪ KHÓA PHÂN LOẠI 6 CHUYÊN MỤC
// ==========================================
var CATEGORY_RULES = [
  {
    category: "Thiên tai",
    priority: 10,
    keywords: [
      "bão", "áp thấp nhiệt đới", "lũ quét", "sạt lở", "sạt lở đất", "sạt lở núi",
      "triều cường", "động đất", "hạn hán", "sụt lún", "vỡ đê", "xả lũ", "hồ chứa",
      "nước lũ", "ngập lụt", "mưa lũ", "thiên tai", "thảm họa", "sóng thần",
      "nước dâng", "mưa cực lớn gây ngập", "bão số", "tâm bão", "đổ bộ vào đất liền"
    ]
  },
  {
    category: "Thời tiết cực đoan",
    priority: 9,
    keywords: [
      "nắng nóng kỷ lục", "nắng nóng gay gắt", "nắng nóng diện rộng", "rét đậm",
      "rét hại", "mưa đá", "lốc xoáy", "gió giật mạnh", "sương muối", "nghịch nhiệt",
      "tia uv", "chỉ số uv", "băng giá", "sương mù dày đặc", "thời tiết cực đoan",
      "nhiệt độ hạ thấp kỷ lục", "nhiệt độ cao nhất lịch sử", "khô hạn khốc liệt",
      "giông sét", "gió lốc", "thời tiết bất thường"
    ]
  },
  {
    category: "Tai nạn",
    priority: 8,
    keywords: [
      "tai nạn", "tai nạn giao thông", "cháy nổ", "hỏa hoạn", "cháy nhà", "cháy chung cư",
      "cứu hộ", "cứu nạn", "sập công trình", "sập giàn giáo", "sập nhà", "lật thuyền",
      "đuối nước", "chìm tàu", "va chạm liên hoàn", "xe khách lật", "tai nạn đường sắt",
      "tai nạn hàng không", "sự cố tàu hỏa", "rơi máy bay", "lực lượng pccc", "thiệt hại về người"
    ]
  },
  {
    category: "Chính trị",
    priority: 7,
    keywords: [
      "nghị quyết", "chính sách ban hành", "kỳ họp", "quốc hội", "đối ngoại",
      "ngoại giao", "chính phủ", "thủ tướng", "chủ tịch nước", "tổng bí thư",
      "cải cách thể chế", "chỉ đạo điều hành", "bộ chính trị", "ban bí thư",
      "ban chấp hành trung ương", "dự thảo luật", "luật sửa đổi", "phiên họp chính phủ",
      "hội đàm", "chuyến thăm cấp nhà nước", "thanh tra chính phủ", "kỷ luật cán bộ"
    ]
  },
  {
    category: "Công nghệ AI",
    priority: 6,
    keywords: [
      "trí tuệ nhân tạo", "artificial intelligence", "llm", "mô hình ngôn ngữ",
      "openai", "chatgpt", "gpt-4", "gpt-5", "gemini", "deepmind", "chip bán dẫn ai",
      "bán dẫn ai", "robot tự hành", "quy định quản lý ai", "machine learning",
      "thị giác máy tính", "antigravity", "claude", "copilot", "nvidia", "tsmc",
      "sinh ảnh ai", "video ai", "ai tạo sinh", "generative ai", "công nghệ ai",
      "ứng dụng ai", "mô hình ai", "chip ai", "trợ lý ai", "giải pháp ai"
    ]
  },
  {
    category: "Thủ thuật IT",
    priority: 5,
    keywords: [
      "an toàn thông tin", "bảo mật mạng", "mã độc", "ransomware", "lỗ hổng bảo mật",
      "hacker", "tấn công mạng", "mẹo phần mềm", "thủ thuật windows", "thủ thuật mac",
      "thủ thuật linux", "thủ thuật máy tính", "tối ưu hóa hệ thống", "lập trình",
      "phím tắt", "tiện ích máy tính", "sửa lỗi phần mềm", "cài đặt hệ điều hành",
      "mật khẩu mạnh", "xác thực 2 bước", "zero-day", "passkey", "bảo vệ dữ liệu"
    ]
  }
];

// =========================================================================
// 4. HÀM CHÍNH: TỰ ĐỘNG TỔNG HỢP TIN TỨC HÀNG NGÀY (CHẠY 07:00 AM)
// =========================================================================
function tuDongTongHopTinTucHangNgay() {
  console.log("=== BẮT ĐẦU QUY TRÌNH TỰ ĐỘNG TỔNG HỢP TIN TỨC BUỔI SÁNG (07:00 AM) ===");
  var startTime = new Date().getTime();

  var ss = layBangTinh();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    khoiTaoDinhDangSheet(sheet);
  }

  // 1. Quét toàn bộ RSS feeds
  var allArticles = [];
  var seenUrls = new Set();

  for (var i = 0; i < RSS_FEEDS.length; i++) {
    var feed = RSS_FEEDS[i];
    try {
      var items = docVaPhanTichRSS(feed);
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (item.link && !seenUrls.has(item.link)) {
          seenUrls.add(item.link);
          allArticles.push(item);
        }
      }
    } catch (err) {
      console.warn("Lỗi khi đọc feed: " + feed.name + " (" + feed.url + "): " + err.message);
    }
  }

  console.log("Tổng số tin bài thô cào được từ RSS: " + allArticles.length);

  // 2. Phân loại chuyên mục và BỘ LỌC ĐỘ TƯƠI MỚI (LỌC BỎ HOÀN TOÀN TIN CŨ)
  var nowMs = new Date().getTime();
  var maxAgeMs = (CONFIG.MAX_ARTICLE_AGE_HOURS || 72) * 60 * 60 * 1000;
  var qualifiedArticles = [];

  for (var k = 0; k < allArticles.length; k++) {
    var art = allArticles[k];

    // CHỐNG TIN CŨ: Bỏ qua tuyệt đối bất kỳ bài báo nào cũ hơn 72 giờ
    if (art.timestamp && (nowMs - art.timestamp > maxAgeMs)) {
      continue;
    }

    var matchedCategory = phanLoaiChuyenMuc(art.title, art.rawDescription);
    if (matchedCategory) {
      art.category = matchedCategory;
      art.prominence = danhGiaMucDoNoiBat(art.title, art.rawDescription, matchedCategory);
      qualifiedArticles.push(art);
    }
  }

  console.log("Số tin bài tươi mới thuộc 6 chuyên mục trọng tâm: " + qualifiedArticles.length);

  // 3. SẮP XẾP CHUẨN XÁC: Ưu tiên tin mới nhất lên đầu danh sách (Chronological Priority)
  qualifiedArticles.sort(function(a, b) {
    // Sắp xếp theo thời gian xuất bản giảm dần (mới nhất lên trên cùng)
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  // Giới hạn số lượng tin hiển thị tối đa
  var finalArticles = qualifiedArticles.slice(0, CONFIG.MAX_ARTICLES);

  // 4. Chuẩn bị ma trận dữ liệu 9 cột để ghi vào Google Sheet
  var rowsToInsert = [];
  for (var m = 0; m < finalArticles.length; m++) {
    var a = finalArticles[m];
    var stt = m + 1;
    var publishTime = a.formattedDate || dinhDangNgayGioAnToan(new Date());
    var category = a.category;
    var title = a.title;
    var tldr = a.tldr;
    var source = a.source;
    var link = a.link;
    var thumbnail = a.thumbnail || CONFIG.FALLBACK_IMAGES[category] || "";
    var prominence = a.prominence;

    rowsToInsert.push([
      stt,
      publishTime,
      category,
      title,
      tldr,
      source,
      link,
      thumbnail,
      prominence
    ]);
  }

  // 5. Ghi vào Google Sheet
  if (CONFIG.WRITE_MODE === "REFRESH_DAILY") {
    // Xóa nội dung từ dòng 2 trở đi để giữ nguyên định dạng Header dòng 1
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.length).clearContent();
    }
    
    // Ghi mới toàn bộ dữ liệu sáng nay
    if (rowsToInsert.length > 0) {
      sheet.getRange(2, 1, rowsToInsert.length, CONFIG.HEADERS.length).setValues(rowsToInsert);
      dinhDangMauSacDuLieu(sheet, rowsToInsert.length);
    }
  } else {
    // Chế độ ghi nối tiếp có chống trùng lặp theo URL
    ghiNoiChongTrungLap(sheet, rowsToInsert);
  }

  var elapsed = ((new Date().getTime() - startTime) / 1000).toFixed(2);
  console.log("=== HOÀN TẤT TỔNG HỢP: Đã ghi " + rowsToInsert.length + " bài báo lên Google Sheet trong " + elapsed + " giây ===");
  return {
    success: true,
    count: rowsToInsert.length,
    elapsedSeconds: elapsed
  };
}

// =========================================================================
// 5. TRÌNH PHÂN TÍCH RSS VÀ BÓC TÁCH NỘI DUNG (PARSING ENGINE)
// =========================================================================
function docVaPhanTichRSS(feed) {
  var results = [];
  var response = UrlFetchApp.fetch(feed.url, {
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NewsPortalBot/2.0"
    }
  });

  if (response.getResponseCode() !== 200) {
    return results;
  }

  var xmlText = response.getContentText("UTF-8");
  
  // Dùng Regex bóc tách từng thẻ <item> nhằm tránh lỗi XML không hợp lệ do ký tự đặc biệt tiếng Việt
  var itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  var match;
  
  var feedItemCount = 0;
  // Giới hạn tối đa 40 bài/feed để vừa lấy được tin mới nhất, vừa tối ưu tốc độ cào (< 15 giây)
  while ((match = itemRegex.exec(xmlText)) !== null && feedItemCount < 40) {
    feedItemCount++;
    var itemContent = match[1];

    // Trích xuất Title
    var title = trichXuatTheXML(itemContent, "title");
    title = lamSachChuoiText(title);

    // Trích xuất Link
    var link = trichXuatTheXML(itemContent, "link");
    if (!link) {
      var guidMatch = itemContent.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
      if (guidMatch && guidMatch[1].indexOf("http") === 0) {
        link = guidMatch[1].trim();
      }
    }

    // Trích xuất PubDate
    var pubDateStr = trichXuatTheXML(itemContent, "pubDate");
    var parsedDate = phanTichNgayGioRSS(pubDateStr);

    // Trích xuất Description / Content
    var rawDesc = trichXuatTheXML(itemContent, "description");
    
    // Trích xuất Ảnh Thumbnail từ Description hoặc thẻ enclosure/media
    var thumbnail = trichXuatThumbnail(itemContent, rawDesc);

    // Tạo bản tóm tắt TL;DR ngắn gọn sạch thẻ HTML (2-3 câu)
    var tldr = taoTomTatTLDR(rawDesc, title);

    if (title && link) {
      results.push({
        title: title,
        link: link,
        pubDate: pubDateStr,
        timestamp: parsedDate.getTime(),
        formattedDate: dinhDangNgayGioAnToan(parsedDate),
        rawDescription: rawDesc,
        tldr: tldr,
        thumbnail: thumbnail,
        source: feed.name
      });
    }
  }

  return results;
}

/**
 * Trích xuất an toàn nội dung bên trong thẻ XML (hỗ trợ cả CDATA)
 */
function trichXuatTheXML(xmlFragment, tagName) {
  var regex = new RegExp("<" + tagName + "[^>]*>([\\s\\S]*?)<\\/" + tagName + ">", "i");
  var match = regex.exec(xmlFragment);
  if (!match) return "";
  var content = match[1];

  // Gỡ CDATA nếu có
  content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  return content.trim();
}

/**
 * Trích xuất ảnh thumbnail từ thẻ <enclosure>, <media:content>, <media:thumbnail> hoặc thẻ <img> trong description
 */
function trichXuatThumbnail(itemXml, descriptionHtml) {
  // 1. Thử tìm trong <enclosure type="image/..." url="...">
  var enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
  if (enclosureMatch && enclosureMatch[1]) {
    return enclosureMatch[1];
  }

  // 2. Thử tìm trong <media:content url="..."> hoặc <media:thumbnail url="...">
  var mediaMatch = itemXml.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["'][^>]*>/i);
  if (mediaMatch && mediaMatch[1]) {
    return mediaMatch[1];
  }

  // 3. Thử tìm thẻ <img src="..."> trong description hoặc content
  var imgMatch = (descriptionHtml || "").match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (imgMatch && imgMatch[1]) {
    var imgSrc = imgMatch[1];
    // Lọc bỏ icon hoặc tracking pixel 1x1
    if (imgSrc.indexOf("data:image") === -1 && imgSrc.indexOf("pixel") === -1) {
      return imgSrc;
    }
  }

  return "";
}

/**
 * Chuyển HTML description thành đoạn văn tóm tắt TL;DR thuần túy 2-3 câu
 */
function taoTomTatTLDR(rawHtml, fallbackTitle) {
  if (!rawHtml) return fallbackTitle || "";

  // Xóa bỏ các thẻ HTML rác
  var clean = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/<img[^>]*>/gi, "");
  clean = clean.replace(/<a[^>]*>[\s\S]*?<\/a>/gi, " ");
  clean = clean.replace(/<\/?[^>]+(>|$)/g, " ");

  // Giải mã các thực thể HTML đặc thù (&amp;, &quot;, &#39;, &nbsp;...)
  clean = lamSachChuoiText(clean);

  // Chuẩn hóa khoảng trắng
  clean = clean.replace(/\s+/g, " ").trim();

  // Cắt lấy 2-3 câu ngắn gọn đầu tiên (khoảng 150-250 ký tự)
  if (clean.length > 280) {
    var cutPos = clean.indexOf(".", 160);
    if (cutPos > 0 && cutPos < 300) {
      clean = clean.substring(0, cutPos + 1).trim();
    } else {
      clean = clean.substring(0, 260) + "...";
    }
  }

  return clean || fallbackTitle;
}

/**
 * Làm sạch chuỗi Text và giải mã XML/HTML Entities
 */
function lamSachChuoiText(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phân tích chuỗi ngày tháng RFC 2822 hoặc ISO từ RSS thành đối tượng Date
 */
function phanTichNgayGioRSS(dateString) {
  if (!dateString) return new Date();
  var d = new Date(dateString);
  if (isNaN(d.getTime())) {
    // Xử lý định dạng ngày giờ báo Tuổi Trẻ: "10/26/2026 2:18:00 PM"
    try {
      var cleanStr = dateString.replace(/\u202f/g, " ").trim();
      var m = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\s*(AM|PM)?/i);
      if (m) {
        var month = parseInt(m[1], 10) - 1;
        var day = parseInt(m[2], 10);
        var year = parseInt(m[3], 10);
        var hour = parseInt(m[4], 10);
        var min = parseInt(m[5], 10);
        var sec = parseInt(m[6], 10);
        if (m[7] && m[7].toUpperCase() === "PM" && hour < 12) hour += 12;
        if (m[7] && m[7].toUpperCase() === "AM" && hour === 12) hour = 0;
        var customDate = new Date(year, month, day, hour, min, sec);
        if (!isNaN(customDate.getTime())) return customDate;
      }
    } catch (e) {}
    return new Date();
  }
  return d;
}

/**
 * Định dạng ngày giờ an toàn tuyệt đối theo chuẩn Hà Nội (dd/MM/yyyy HH:mm)
 * Tránh lỗi Java SimpleDateFormat trong Apps Script
 */
function dinhDangNgayGioAnToan(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }
  var datePart = Utilities.formatDate(dateObj, CONFIG.TIMEZONE, "dd/MM/yyyy");
  var timePart = Utilities.formatDate(dateObj, CONFIG.TIMEZONE, "HH:mm");
  return datePart + " " + timePart;
}

// =========================================================================
// 6. THUẬT TOÁN PHÂN LOẠI CHUYÊN MỤC & ĐÁNH GIÁ NỔI BẬT
// =========================================================================
function phanLoaiChuyenMuc(title, description) {
  var contentToSearch = ((title || "") + " " + (description || "")).toLowerCase();

  var bestCategory = null;
  var maxScore = 0;

  for (var i = 0; i < CATEGORY_RULES.length; i++) {
    var rule = CATEGORY_RULES[i];
    var currentScore = 0;

    for (var j = 0; j < rule.keywords.length; j++) {
      var kw = rule.keywords[j].toLowerCase();
      // Nếu từ khóa xuất hiện ở Tiêu đề: cộng 3 điểm trọng số
      if (title && title.toLowerCase().indexOf(kw) !== -1) {
        currentScore += 3;
      }
      // Nếu xuất hiện ở nội dung tóm tắt: cộng 1 điểm
      if (description && description.toLowerCase().indexOf(kw) !== -1) {
        currentScore += 1;
      }
    }

    if (currentScore > 0) {
      // Kết hợp điểm khớp từ khóa và độ ưu tiên danh mục
      var totalWeightedScore = currentScore * 10 + rule.priority;
      if (totalWeightedScore > maxScore) {
        maxScore = totalWeightedScore;
        bestCategory = rule.category;
      }
    }
  }

  // Kiểm tra riêng từ viết hoa "AI" (phân biệt hoa thường để tránh nhầm với đại từ "của ai", "hai", "ngày mai"...)
  if (/\bAI\b/.test(title || "") || /\bAI\b/.test(description || "")) {
    var aiScore = (/\bAI\b/.test(title || "") ? 3 : 1) * 10 + 6;
    if (aiScore > maxScore) {
      maxScore = aiScore;
      bestCategory = "Công nghệ AI";
    }
  }

  return bestCategory;
}

function danhGiaMucDoNoiBat(title, description, category) {
  var text = ((title || "") + " " + (description || "")).toLowerCase();

  // Nhóm từ khóa chỉ thị Tin Tiêu Điểm
  var tieuDiemKeywords = [
    "khẩn cấp", "đặc biệt", "chỉ đạo nóng", "bão số", "bước ngoặt",
    "đột phá", "cảnh báo đỏ", "tai nạn thảm khốc", "cháy lớn",
    "nghị quyết mới", "ban hành", "siêu bão", "chấn động"
  ];
  for (var i = 0; i < tieuDiemKeywords.length; i++) {
    if (text.indexOf(tieuDiemKeywords[i]) !== -1) {
      return "Tin tiêu điểm";
    }
  }

  // Nhóm từ khóa Tin Nóng
  var tinNongKeywords = [
    "nóng", "cảnh báo", "mới nhất", "báo động", "quan trọng",
    "chính thức", "tử vong", "thiệt hại nặng", "kỷ lục", "nguy hiểm",
    "ra mắt", "công bố", "phát hiện", "hỏa tốc"
  ];
  for (var j = 0; j < tinNongKeywords.length; j++) {
    if (text.indexOf(tinNongKeywords[j]) !== -1) {
      return "Tin nóng";
    }
  }

  return "Tin thường";
}

// =========================================================================
// 7. KHỞI TẠO BẢNG TÍNH & ĐỊNH DẠNG MÀU SẮC CHUẨN TÒA SOẠN
// =========================================================================
function khoiTaoDinhDangSheet(sheet) {
  sheet.clear();
  sheet.setFrozenRows(1);

  // 1. Ghi Header dòng 1
  var headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
  headerRange.setValues([CONFIG.HEADERS]);

  // Định dạng Header: Nền xanh than sang trọng #1E293B, chữ trắng in đậm, canh giữa
  headerRange.setBackground("#1E293B")
             .setFontColor("#FFFFFF")
             .setFontWeight("bold")
             .setFontFamily("Segoe UI")
             .setFontSize(10)
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");

  sheet.setRowHeight(1, 38);

  // 2. Thiết lập độ rộng cột tối ưu
  var columnWidths = [
    50,   // A: STT
    140,  // B: Thời gian xuất bản
    130,  // C: Chuyên mục
    320,  // D: Tiêu đề bài báo
    420,  // E: Tóm tắt nhanh (TL;DR)
    110,  // F: Nguồn báo chí
    260,  // G: Link bài viết gốc
    260,  // H: Ảnh thumbnail
    110   // I: Mức độ nổi bật
  ];

  for (var i = 0; i < columnWidths.length; i++) {
    sheet.setColumnWidth(i + 1, columnWidths[i]);
  }

  console.log("Đã khởi tạo bảng tính chuẩn 9 cột với giao diện đẹp mắt.");
}

function dinhDangMauSacDuLieu(sheet, numRows) {
  if (numRows <= 0) return;

  var dataRange = sheet.getRange(2, 1, numRows, CONFIG.HEADERS.length);
  dataRange.setFontFamily("Segoe UI")
           .setFontSize(10)
           .setVerticalAlignment("middle");

  // Canh giữa các cột ngắn: STT (A), Thời gian (B), Chuyên mục (C), Nguồn (F), Mức độ (I)
  sheet.getRange(2, 1, numRows, 3).setHorizontalAlignment("center");
  sheet.getRange(2, 6, numRows, 1).setHorizontalAlignment("center");
  sheet.getRange(2, 9, numRows, 1).setHorizontalAlignment("center");

  // Canh trái và cho phép wrap text với Tiêu đề (D) và Tóm tắt (E)
  sheet.getRange(2, 4, numRows, 2).setWrap(true).setHorizontalAlignment("left");
}

function ghiNoiChongTrungLap(sheet, newRows) {
  if (newRows.length === 0) return;

  var lastRow = sheet.getLastRow();
  var existingUrls = new Set();

  if (lastRow > 1) {
    var urlValues = sheet.getRange(2, 7, lastRow - 1, 1).getValues();
    for (var i = 0; i < urlValues.length; i++) {
      if (urlValues[i][0]) {
        existingUrls.add(String(urlValues[i][0]).trim());
      }
    }
  }

  var filteredRows = [];
  var currentStt = lastRow;

  for (var j = 0; j < newRows.length; j++) {
    var row = newRows[j];
    var url = String(row[6]).trim();
    if (!existingUrls.has(url)) {
      row[0] = currentStt++;
      filteredRows.push(row);
      existingUrls.add(url);
    }
  }

  if (filteredRows.length > 0) {
    sheet.getRange(lastRow + 1, 1, filteredRows.length, CONFIG.HEADERS.length).setValues(filteredRows);
    dinhDangMauSacDuLieu(sheet, sheet.getLastRow() - 1);
    console.log("Đã bổ sung " + filteredRows.length + " bài báo mới vào cuối Sheet.");
  } else {
    console.log("Không có bài báo mới nào phát sinh.");
  }
}

// =========================================================================
// 8. TỰ ĐỘNG THIẾT LẬP TIME-DRIVEN TRIGGER (CHẠY 07:00 - 08:00 AM HÀNG NGÀY)
// =========================================================================
/**
 * Chạy hàm này 1 lần duy nhất trong trình soạn thảo Apps Script để cài đặt
 * tự động kích hoạt cào tin vào khung giờ 07:00 sáng mỗi ngày.
 */
function thietLapTriggerHangNgay() {
  console.log("=== BẮT ĐẦU CÀI ĐẶT TRIGGER TỰ ĐỘNG 07:00 SÁNG ===");
  var ss = layBangTinh();
  console.log("1. Kết nối bảng tính thành công: " + ss.getName() + " (ID: " + ss.getId() + ")");

  // 1. Xóa các trigger cũ cùng tên để tránh kích hoạt trùng lặp
  var allTriggers = ScriptApp.getProjectTriggers();
  var deletedCount = 0;
  for (var i = 0; i < allTriggers.length; i++) {
    if (allTriggers[i].getHandlerFunction() === "tuDongTongHopTinTucHangNgay") {
      ScriptApp.deleteTrigger(allTriggers[i]);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    console.log("2. Đã dọn dẹp " + deletedCount + " trigger cũ.");
  }

  // 2. Tạo Trigger chạy hàng ngày lúc 07:00 AM (Múi giờ Asia/Ho_Chi_Minh)
  var trigger = ScriptApp.newTrigger("tuDongTongHopTinTucHangNgay")
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  console.log("✅ CÀI ĐẶT THÀNH CÔNG RỰC RỠ!");
  console.log(" - Tên hàm kích hoạt: tuDongTongHopTinTucHangNgay");
  console.log(" - Tần suất: Chạy mỗi ngày lúc 07:00 AM");
  console.log(" - Múi giờ: " + CONFIG.TIMEZONE + " (Giờ Hà Nội)");
  console.log(" - ID Trigger: " + trigger.getUniqueId());
}

/**
 * KIỂM TRA TRẠNG THÁI TRIGGER (Chẩn đoán xem Trigger đã được bật hay chưa)
 */
function kiemTraTrangThaiTrigger() {
  console.log("=== BÁO CÁO TRẠNG THÁI BỘ KÍCH HOẠT (TRIGGER STATUS) ===");
  var ss = layBangTinh();
  console.log("1. Bảng tính kết nối: " + ss.getName() + " (Tab: " + CONFIG.SHEET_NAME + ")");

  var allTriggers = ScriptApp.getProjectTriggers();
  console.log("2. Tổng số Trigger đang đăng ký trên Google Cloud: " + allTriggers.length);

  var found = false;
  for (var i = 0; i < allTriggers.length; i++) {
    var t = allTriggers[i];
    console.log(" • Trigger #" + (i + 1) + ": Hàm = [" + t.getHandlerFunction() + "] | Loại = " + t.getEventType());
    if (t.getHandlerFunction() === "tuDongTongHopTinTucHangNgay") {
      found = true;
    }
  }

  if (found) {
    console.log("✅ TRẠNG THÁI: Trigger tự động 07:00 sáng ĐANG HOẠT ĐỘNG BÌNH THƯỜNG.");
  } else {
    console.warn("⚠️ CẢNH BÁO: CHƯA CÓ TRIGGER NÀO ĐƯỢC TẠO!");
    console.warn("👉 HƯỚNG DẪN: Trên thanh công cụ Apps Script, chọn hàm 'thietLapTriggerHangNgay' và bấm nút [Chạy] (Run) 1 lần để kích hoạt tự động.");
  }
}

/**
 * Xóa trigger tự động nếu muốn tạm dừng hệ thống
 */
function huyTriggerHangNgay() {
  var allTriggers = ScriptApp.getProjectTriggers();
  var count = 0;
  for (var i = 0; i < allTriggers.length; i++) {
    if (allTriggers[i].getHandlerFunction() === "tuDongTongHopTinTucHangNgay") {
      ScriptApp.deleteTrigger(allTriggers[i]);
      count++;
    }
  }
  console.log("Đã hủy bỏ " + count + " trigger tự động.");
}

/**
 * Hàm kiểm tra nhanh: Cào tin và cập nhật bảng tính ngay lập tức
 */
function chayThuNghiemNgay() {
  var ss = layBangTinh();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    khoiTaoDinhDangSheet(sheet);
  }
  return tuDongTongHopTinTucHangNgay();
}

// =========================================================================
// 9. WEB APP ENDPOINT (DỰ PHÒNG CUNG CẤP JSON API NẾU CẦN)
// =========================================================================
function doGet(e) {
  // Cho phép kích hoạt cào tin tức tức thì từ xa qua URL: ?action=update
  if (e && e.parameter && (e.parameter.action === 'update' || e.parameter.action === 'sync' || e.parameter.action === 'crawl')) {
    try {
      tuDongTongHopTinTucHangNgay();
    } catch (err) {
      console.warn("Lỗi khi tự động cập nhật qua Web App: " + err.message);
    }
  }

  var ss = layBangTinh();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }

  var headers = data[0];
  var articles = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    articles.push({
      stt: row[0],
      publishedAt: row[1],
      category: row[2],
      title: row[3],
      tldr: row[4],
      source: row[5],
      link: row[6],
      thumbnail: row[7],
      prominence: row[8]
    });
  }

  var callback = e && e.parameter && e.parameter.callback;
  var jsonStr = JSON.stringify({
    success: true,
    total: articles.length,
    updatedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
    data: articles
  });

  if (callback) {
    return ContentService.createTextOutput(callback + "(" + jsonStr + ")")
                         .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(jsonStr)
                       .setMimeType(ContentService.MimeType.JSON);
}
