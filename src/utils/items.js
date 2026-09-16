// Gemeinsame Queries rund um Items, damit öffentliche und Admin-Routen
// nicht dasselbe SQL doppelt pflegen.

const LIST_SQL = `
  SELECT
    i.id, i.type, i.title, i.year, i.cover_url, i.description,
    i.host_rating, i.host_note, i.created_at,
    COUNT(DISTINCT l.visitor_id) AS like_count,
    COUNT(DISTINCT r.visitor_id) AS rating_count,
    COUNT(DISTINCT c.id) AS comment_count,
    AVG(r.rating) AS avg_rating
  FROM items i
  LEFT JOIN likes l ON l.item_id = i.id
  LEFT JOIN ratings r ON r.item_id = i.id
  LEFT JOIN comments c ON c.item_id = i.id
`;

export async function listItems(db, { type } = {}) {
  let sql = LIST_SQL;
  const binds = [];
  if (type) {
    sql += " WHERE i.type = ?";
    binds.push(type);
  }
  sql += " GROUP BY i.id ORDER BY i.created_at DESC";
  const { results } = await db.prepare(sql).bind(...binds).all();
  return results.map(shapeItem);
}

export async function getItem(db, id, visitorId) {
  const sql = `${LIST_SQL} WHERE i.id = ? GROUP BY i.id`;
  const row = await db.prepare(sql).bind(id).first();
  if (!row) return null;
  const item = shapeItem(row);

  if (visitorId) {
    const liked = await db
      .prepare("SELECT 1 FROM likes WHERE item_id = ? AND visitor_id = ?")
      .bind(id, visitorId)
      .first();
    const myRating = await db
      .prepare("SELECT rating FROM ratings WHERE item_id = ? AND visitor_id = ?")
      .bind(id, visitorId)
      .first();
    item.liked_by_me = !!liked;
    item.my_rating = myRating ? myRating.rating : null;
  }
  return item;
}

function shapeItem(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    year: row.year,
    cover_url: row.cover_url,
    description: row.description,
    host_rating: row.host_rating,
    host_note: row.host_note,
    created_at: row.created_at,
    like_count: row.like_count || 0,
    rating_count: row.rating_count || 0,
    comment_count: row.comment_count || 0,
    avg_rating: row.avg_rating ? Math.round(row.avg_rating * 10) / 10 : null,
  };
}
