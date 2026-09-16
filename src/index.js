import { error } from "./utils/http.js";
import {
  handleListItems,
  handleGetItem,
  handleLike,
  handleRating,
  handleClearRating,
  handleListComments,
  handleAddComment,
} from "./handlers/items.js";
import {
  handleCreateItem,
  handleUpdateItem,
  handleDeleteItem,
  handleDeleteComment,
} from "./handlers/admin.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // ---- öffentliche API ----
      if (pathname === "/api/items" && method === "GET") {
        return handleListItems(request, env, url);
      }

      const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
      if (itemMatch && method === "GET") {
        return handleGetItem(request, env, itemMatch[1]);
      }

      const likeMatch = pathname.match(/^\/api\/items\/([^/]+)\/like$/);
      if (likeMatch && method === "POST") {
        return handleLike(request, env, likeMatch[1]);
      }

      const ratingMatch = pathname.match(/^\/api\/items\/([^/]+)\/rating$/);
      if (ratingMatch && method === "POST") {
        return handleRating(request, env, ratingMatch[1]);
      }
      if (ratingMatch && method === "DELETE") {
        return handleClearRating(request, env, ratingMatch[1]);
      }

      const commentsMatch = pathname.match(/^\/api\/items\/([^/]+)\/comments$/);
      if (commentsMatch && method === "GET") {
        return handleListComments(env, commentsMatch[1]);
      }
      if (commentsMatch && method === "POST") {
        return handleAddComment(request, env, commentsMatch[1]);
      }

      // ---- Admin-API (Zugriff nur über /admin/* + Cloudflare Access) ----
      if (pathname === "/admin/api/items" && method === "POST") {
        return handleCreateItem(request, env);
      }

      const adminItemMatch = pathname.match(/^\/admin\/api\/items\/([^/]+)$/);
      if (adminItemMatch && method === "PUT") {
        return handleUpdateItem(request, env, adminItemMatch[1]);
      }
      if (adminItemMatch && method === "DELETE") {
        return handleDeleteItem(request, env, adminItemMatch[1]);
      }

      const adminCommentMatch = pathname.match(/^\/admin\/api\/comments\/([^/]+)$/);
      if (adminCommentMatch && method === "DELETE") {
        return handleDeleteComment(request, env, adminCommentMatch[1]);
      }

      // ---- alles andere: statische Datei aus /public ausliefern ----
      return env.ASSETS.fetch(request);
    } catch (err) {
      return error("Serverfehler: " + err.message, 500);
    }
  },
};
