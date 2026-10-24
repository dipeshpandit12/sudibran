"""The parser as its own service (compose). The only process holding ANTHROPIC_API_KEY_PARSER,
on a network whose only egress is the model API. It can't reach the broker, Nessie or CRS.
    uvicorn app.agents.parser_service:app --port 8003"""

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.agents.parser import ParserRefused, parse_local
from app.config import get_settings


class ParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


def _internal(x_internal_token: str = Header(default="")) -> None:
    expected = get_settings().parser_token
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="internal callers only")


app = FastAPI(title="Sudibran parser (quarantined)", docs_url=None, redoc_url=None)


@app.post("/parse", dependencies=[Depends(_internal)])
async def parse(body: ParseIn) -> dict:
    try:
        fields, backend = await parse_local(body.text)
    except ParserRefused as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"fields": fields.model_dump(), "backend": backend}


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "backend": "claude" if get_settings().anthropic_api_key_parser else "offline"}
