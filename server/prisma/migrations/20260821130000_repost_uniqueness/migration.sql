-- Prevent duplicate repost rows for the same user and original post.
-- PostgreSQL's nullable unique semantics still allow ordinary posts, whose
-- repostOfId is NULL, to coexist.
CREATE UNIQUE INDEX "Post_authorId_repostOfId_key"
ON "Post"("authorId", "repostOfId");
