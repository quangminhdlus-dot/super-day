
export const OPENING_EPOCH = '2026-11-27';

const commons = file => 'https://commons.wikimedia.org/wiki/File:' + file;
const cc = license => 'https://creativecommons.org/' + license + '/';

export const DAILY_PLACES = [
  {
    id: 'santorini', name: 'Santorini', country: 'Hy Lạp', address: 'Oia, quần đảo Cyclades',
    keywords: ['Biển Aegea', 'Mái vòm xanh', 'Nhà quét vôi'],
    image: 'photos/opening/santorini.webp', position: [0.56, 0.50],
    source: 'https://www.visitgreece.gr/en/routes/santorini-sunset-overlooking-the-caldera',
    photo: 'https://unsplash.com/photos/white-buildings-with-blue-domes-overlook-the-sea-3wNnVgWZLbI', creator: 'Aurora Song', license: 'https://unsplash.com/license',
  },
  {
    id: 'aoraki', name: 'Aoraki', country: 'New Zealand', address: 'Canterbury, Đảo Nam',
    keywords: ['Đỉnh tuyết', 'Hồ Hooker', 'Nam Alps'],
    image: 'photos/aoraki.webp', position: [0.48, 0.48],
    source: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/canterbury/places/aoraki-mount-cook-national-park/',
    photo: commons('Hooker_Lake.jpg'), creator: 'A S', license: cc('licenses/by/2.0'),
  },
  {
    id: 'machu-picchu', name: 'Machu Picchu', country: 'Peru', address: 'Cusco, dãy Andes',
    keywords: ['Di sản Inca', 'Ruộng bậc thang', 'Dãy Andes'],
    image: 'photos/opening/machu-picchu.webp', position: [0.50, 0.50],
    source: 'https://whc.unesco.org/en/list/274/',
    photo: commons('Machu_Picchu,_Peru.jpg'), creator: 'Pedro Szekely', license: cc('licenses/by-sa/2.0'),
  },
  {
    id: 'petra', name: 'Petra', country: 'Jordan', address: 'Wadi Musa, miền nam Jordan',
    keywords: ['Đá sa thạch', 'Người Nabataea', 'Phù điêu đá'],
    image: 'photos/opening/petra.webp', position: [0.50, 0.50],
    source: 'https://whc.unesco.org/en/list/326/',
    photo: commons('PetraJordan.jpg'), creator: 'David Bjorgen; perspective correction by Massimo Catarinella', license: cc('licenses/by-sa/2.5'),
  },
  {
    id: 'fuji', name: 'Núi Phú Sĩ', country: 'Nhật Bản', address: 'Nhìn từ Fujiyoshida, Yamanashi',
    keywords: ['Núi lửa', 'Tháp Chūreitō', 'Di sản văn hóa'],
    image: 'photos/opening/fuji.webp', position: [0.62, 0.50],
    source: 'https://whc.unesco.org/en/list/1418/',
    photo: commons('Chureito_Pagoda_and_Mount_Fuji_20241022.jpg'), creator: 'Supanut Arunoprayote', license: cc('licenses/by/4.0'),
  },
  {
    id: 'moraine', name: 'Hồ Moraine', country: 'Canada', address: 'Vườn quốc gia Banff, Alberta',
    keywords: ['Hồ băng hà', 'Núi Rocky', 'Thung lũng Mười Đỉnh'],
    image: 'photos/opening/moraine.webp', position: [0.47, 0.50],
    source: 'https://parks.canada.ca/pn-np/ab/banff/activ/~/~/~/link.aspx?_id=8E827CA789664D99BB5DA22EBF279BE3&_z=z',
    photo: commons('Moraine_Lake_sunrise.jpg'), creator: 'Jakub Fryš', license: cc('licenses/by-sa/4.0'),
  },
  {
    id: 'mont-saint-michel', name: 'Mont Saint-Michel', country: 'Pháp', address: 'Normandie, miền tây bắc nước Pháp',
    keywords: ['Tu viện', 'Thủy triều', 'Kiến trúc Gothic'],
    image: 'photos/opening/mont-saint-michel.webp', position: [0.50, 0.50],
    source: 'https://whc.unesco.org/en/list/80/',
    photo: commons('Mont-Saint-Michel-At-Night.jpg'), creator: 'Lubosz', license: cc('licenses/by-sa/3.0'),
  },
  {
    id: 'grand-teton', name: 'Grand Teton', country: 'Hoa Kỳ', address: 'Vườn quốc gia Grand Teton, Wyoming',
    keywords: ['Dãy Teton', 'Jackson Lake', 'Đồng cỏ'],
    image: 'photos/grand-teton.webp', position: [0.48, 0.50],
    source: 'https://www.usgs.gov/media/images/grand-tetons',
    photo: 'https://www.usgs.gov/media/images/grand-tetons', creator: 'Scott Horvath / USGS', license: cc('publicdomain/zero/1.0'),
  },
];

export function dailyPlace(localDay) {
  const offset = (Date.parse(localDay + 'T00:00:00Z') - Date.parse(OPENING_EPOCH)) / 86400000;
  return DAILY_PLACES[((offset % DAILY_PLACES.length) + DAILY_PLACES.length) % DAILY_PLACES.length];
}
