import { describe, expect, it } from 'vitest';
import { CHANNEL_ID_RE, parseChannelInput, parseHandle } from '../src/channelId';

const ID = 'UC1234567890123456789012';

describe('CHANNEL_ID_RE', () => {
  it('matches a valid ID', () => {
    expect(CHANNEL_ID_RE.test(ID)).toBe(true);
  });
});

describe('parseChannelInput', () => {
  it('accepts a bare ID', () => {
    expect(parseChannelInput(ID)).toBe(ID);
  });

  it('accepts a channel URL with scheme', () => {
    expect(parseChannelInput(`https://www.youtube.com/channel/${ID}`)).toBe(ID);
  });

  it('accepts a channel URL without scheme', () => {
    expect(parseChannelInput(`www.youtube.com/channel/${ID}`)).toBe(ID);
  });

  it('accepts m.youtube.com', () => {
    expect(parseChannelInput(`https://m.youtube.com/channel/${ID}?feature=share`)).toBe(ID);
  });

  it('accepts a feed URL with channel_id', () => {
    expect(
      parseChannelInput(`https://www.youtube.com/feeds/videos.xml?channel_id=${ID}`),
    ).toBe(ID);
  });

  it('trims whitespace', () => {
    expect(parseChannelInput(`  ${ID}  `)).toBe(ID);
  });

  it('rejects @handle', () => {
    expect(parseChannelInput('@somehandle')).toBeNull();
  });

  it('rejects a short ID', () => {
    expect(parseChannelInput('UC12345')).toBeNull();
  });

  it('rejects a wrong prefix', () => {
    expect(parseChannelInput('XY1234567890123456789012')).toBeNull();
  });

  it('rejects a 23-character ID', () => {
    expect(parseChannelInput('UC123456789012345678901')).toBeNull();
  });

  it('rejects /user/ URLs', () => {
    expect(parseChannelInput('https://www.youtube.com/user/someuser')).toBeNull();
  });

  it('rejects /c/ URLs', () => {
    expect(parseChannelInput('https://www.youtube.com/c/somechannel')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(parseChannelInput('hello world')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseChannelInput('')).toBeNull();
    expect(parseChannelInput('   ')).toBeNull();
  });
});

describe('parseHandle', () => {
  it('accepts bare handles and youtube.com/@handle URLs', () => {
    expect(parseHandle('@veritasium')).toBe('@veritasium');
    expect(parseHandle('  @Veritasium  ')).toBe('@Veritasium');
    expect(parseHandle('https://www.youtube.com/@veritasium')).toBe('@veritasium');
    expect(parseHandle('https://youtube.com/@veritasium/videos')).toBe('@veritasium');
  });

  it('rejects other inputs', () => {
    expect(parseHandle('@ab')).toBeNull();
    expect(parseHandle('veritasium')).toBeNull();
    expect(parseHandle('https://evil.example/@veritasium')).toBeNull();
    expect(parseHandle('https://www.youtube.com/channel/UC1234567890123456789012')).toBeNull();
  });
});
