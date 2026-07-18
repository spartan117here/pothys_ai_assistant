from typing import Optional
from pydantic import BaseModel
import uuid
from datetime import datetime

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str
    branch_id: Optional[uuid.UUID] = None

class NotificationCreate(NotificationBase):
    pass

class NotificationUpdate(BaseModel):
    is_read: bool

class NotificationInDB(NotificationBase):
    id: uuid.UUID
    user_id: uuid.UUID
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

