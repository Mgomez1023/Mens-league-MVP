import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class PostOut(BaseModel):
    id: int
    content: str
    author_name: str
    created_at: datetime.datetime
    image_url: str | None = None
