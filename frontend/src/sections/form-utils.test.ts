import { COUNTRY_BY_ISO } from './country-codes';
import {
    cleanNationalNumber,
    isValidInternationalPhone,
    joinInternationalPhone,
    splitInternationalPhone,
} from './form-utils';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runFormUtilsAssertions(): void {
    const india = splitInternationalPhone('+919000000000');
    assert(india?.country.iso === 'IN', 'an Indian number is split into India');
    assert(india?.national === '9000000000', 'the number after the country code is kept');

    const us = splitInternationalPhone('+14155550123');
    assert(us?.country.iso === 'US', '+1 shows the first country that uses it');
    assert(us?.national === '4155550123', 'the +1 number keeps its area code');

    const puertoRico = splitInternationalPhone('+17875550123');
    assert(puertoRico?.country.iso === 'PR', 'the longest matching calling code wins');

    assert(splitInternationalPhone('9000000000') === null, 'a number without + has no country');
    assert(splitInternationalPhone('') === null, 'an empty value has no country');
    assert(splitInternationalPhone('+0123456789') === null, 'an unknown code has no country');

    assert(
        splitInternationalPhone('+91 90000-00000')?.national === '9000000000',
        'spaces and dashes in a pasted number are ignored',
    );

    assert(cleanNationalNumber('90000 00000') === '9000000000', 'spaces are dropped');
    assert(cleanNationalNumber('(415) 555-0123') === '4155550123', 'punctuation is dropped');
    assert(cleanNationalNumber('07700 900123') === '7700900123', 'trunk zeros are dropped');
    assert(cleanNationalNumber('abc') === '', 'letters are dropped');

    const uk = COUNTRY_BY_ISO.get('GB');
    assert(uk !== undefined, 'the United Kingdom is listed');
    assert(
        joinInternationalPhone(uk!, '7700900123') === '+447700900123',
        'country code and number are joined into one international number',
    );
    assert(joinInternationalPhone(uk!, '') === '', 'no number leaves the value empty');

    assert(
        isValidInternationalPhone(joinInternationalPhone(uk!, '7700900123')),
        'a joined number passes the international validation',
    );
}
